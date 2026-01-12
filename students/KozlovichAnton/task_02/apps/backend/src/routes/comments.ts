import { Router } from "express";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { ensureProjectReadAccess, getProjectAndMembership } from "../lib/access";

const commentsRouter = Router();

const listSchema = z.object({
  bugId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const createSchema = z.object({
  bugId: z.string().uuid(),
  content: z.string().min(1).max(2000)
});

const updateSchema = z.object({
  content: z.string().min(1).max(2000)
});

const sanitizeContent = (value: string) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();

commentsRouter.use(requireAuth);

commentsRouter.get("/", async (req, res, next) => {
  try {
    const { bugId, limit, offset } = listSchema.parse(req.query);
    const bug = await prisma.bug.findUnique({ where: { id: bugId }, include: { project: true } });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const comments = await prisma.comment.findMany({
      where: { bugId },
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" }
    });
    return res.json({ status: "ok", data: comments });
  } catch (err) {
    return next(err);
  }
});

commentsRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const bug = await prisma.bug.findUnique({ where: { id: body.bugId }, include: { project: true } });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const clean = sanitizeContent(body.content);
    if (!clean) throw new HttpError(400, "Comment is empty after sanitization");

    const comment = await prisma.comment.create({
      data: {
        bugId: body.bugId,
        content: clean,
        authorId: req.user!.id
      }
    });
    return res.status(201).json({ status: "ok", data: comment });
  } catch (err) {
    return next(err);
  }
});

commentsRouter.put("/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const comment = await prisma.comment.findUnique({
      where: { id: req.params.id },
      include: { bug: { include: { project: true } } }
    });
    if (!comment) throw new HttpError(404, "Comment not found");
    const ctx = await getProjectAndMembership(comment.bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const isAdmin = req.user?.role === "admin";
    const isOwnerOrManager = ctx.membership?.role === "owner" || ctx.membership?.role === "manager";
    const isAuthor = comment.authorId === req.user?.id;
    if (!isAdmin && !isOwnerOrManager && !isAuthor) throw new HttpError(403, "Forbidden");

    const clean = sanitizeContent(body.content);
    if (!clean) throw new HttpError(400, "Comment is empty after sanitization");

    const updated = await prisma.comment.update({ where: { id: comment.id }, data: { content: clean } });
    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

commentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: req.params.id },
      include: { bug: { include: { project: true } } }
    });
    if (!comment) throw new HttpError(404, "Comment not found");
    const ctx = await getProjectAndMembership(comment.bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const isAdmin = req.user?.role === "admin";
    const isOwnerOrManager = ctx.membership?.role === "owner" || ctx.membership?.role === "manager";
    const isAuthor = comment.authorId === req.user?.id;
    if (!isAdmin && !isOwnerOrManager && !isAuthor) throw new HttpError(403, "Forbidden");

    await prisma.comment.delete({ where: { id: comment.id } });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export { commentsRouter };
