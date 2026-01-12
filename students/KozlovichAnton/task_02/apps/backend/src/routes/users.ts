import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { hashPassword } from "../lib/password";

const usersRouter = Router();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const userCreateSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[A-Za-z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "manager", "developer", "user"]).default("user")
});

const userUpdateSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[A-Za-z0-9_]+$/).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "manager", "developer", "user"]).optional()
});

const ensureAdmin = (req: any) => {
  if (req.user?.role !== "admin") throw new HttpError(403, "Forbidden");
};

usersRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
    if (!user) throw new HttpError(404, "User not found");
    return res.json({ status: "ok", data: user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const { limit, offset } = paginationSchema.parse(req.query);
    const users = await prisma.user.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
    return res.json({ status: "ok", data: users });
  } catch (err) {
    return next(err);
  }
});

usersRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const body = userCreateSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const created = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
        role: body.role
      },
      select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
    return res.status(201).json({ status: "ok", data: created });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = req.params.id;
    if (req.user?.role !== "admin" && req.user?.id !== userId) throw new HttpError(403, "Forbidden");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
    if (!user) throw new HttpError(404, "User not found");
    return res.json({ status: "ok", data: user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = req.params.id;
    const body = userUpdateSchema.parse(req.body);
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && req.user?.id !== userId) throw new HttpError(403, "Forbidden");
    if (!isAdmin && body.role) throw new HttpError(403, "Forbidden");

    const data: Record<string, unknown> = {};
    if (body.username !== undefined) data.username = body.username;
    if (body.email !== undefined) data.email = body.email;
    if (body.role !== undefined) data.role = body.role;
    if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

usersRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const userId = req.params.id;

    const bugCount = await prisma.bug.count({ where: { createdBy: userId } });
    if (bugCount > 0) throw new HttpError(400, "Cannot delete user with created bugs");

    await prisma.user.delete({ where: { id: userId } });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export { usersRouter };
