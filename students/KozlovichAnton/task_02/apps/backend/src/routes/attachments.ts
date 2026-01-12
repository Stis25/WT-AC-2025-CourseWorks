import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import type { FileFilterCallback } from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { ensureProjectReadAccess, getProjectAndMembership } from "../lib/access";

const attachmentsRouter = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
};

const allowedMime = new Set([
  "application/pdf",
  "text/plain",
  "text/csv"
]);

const storage = multer.diskStorage({
  destination: (
    _req: Express.Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const unique = `${Date.now()}-${crypto.randomUUID()}-${safeOriginal}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    if (allowedMime.has(file.mimetype)) return cb(null, true);
    return cb(new HttpError(400, "Unsupported file type"));
  }
});

const listSchema = z.object({
  bugId: z.string().uuid()
});

const createSchema = z.object({
  bugId: z.string().uuid()
});

attachmentsRouter.use(requireAuth);

attachmentsRouter.get("/", async (req, res, next) => {
  try {
    const { bugId } = listSchema.parse(req.query);
    const bug = await prisma.bug.findUnique({ where: { id: bugId }, include: { project: true } });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const attachments = await prisma.attachment.findMany({ where: { bugId } });
    return res.json({ status: "ok", data: attachments });
  } catch (err) {
    return next(err);
  }
});

attachmentsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const file = req.file;
    if (!file) throw new HttpError(400, "File is required");

    const bug = await prisma.bug.findUnique({ where: { id: body.bugId }, include: { project: true } });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const attachment = await prisma.attachment.create({
      data: {
        bugId: body.bugId,
        filename: file.originalname,
        filePath: file.path,
        uploadedBy: req.user!.id
      }
    });

    return res.status(201).json({ status: "ok", data: attachment });
  } catch (err) {
    return next(err);
  }
});

attachmentsRouter.get("/:id/download", async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: { bug: { include: { project: true } } }
    });
    if (!attachment) throw new HttpError(404, "Attachment not found");
    const ctx = await getProjectAndMembership(attachment.bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const fullPath = path.resolve(attachment.filePath);
    if (!fullPath.startsWith(UPLOAD_DIR)) throw new HttpError(400, "Invalid file path");
    if (!fs.existsSync(fullPath)) throw new HttpError(404, "File not found on disk");

    return res.download(fullPath, attachment.filename);
  } catch (err) {
    return next(err);
  }
});

attachmentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: { bug: { include: { project: true } } }
    });
    if (!attachment) throw new HttpError(404, "Attachment not found");
    const ctx = await getProjectAndMembership(attachment.bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const isAdmin = req.user?.role === "admin";
    const isOwnerOrManager = ctx.membership?.role === "owner" || ctx.membership?.role === "manager";
    const isAuthor = attachment.uploadedBy === req.user?.id;

    if (!isAdmin && !isOwnerOrManager && !isAuthor) throw new HttpError(403, "Forbidden");

    await prisma.attachment.delete({ where: { id: attachment.id } });
    const fullPath = path.resolve(attachment.filePath);
    if (fullPath.startsWith(UPLOAD_DIR) && fs.existsSync(fullPath)) {
      fs.unlink(fullPath, () => {});
    }
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export { attachmentsRouter };
