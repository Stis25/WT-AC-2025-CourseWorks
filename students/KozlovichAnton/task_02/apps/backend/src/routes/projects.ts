import { Router } from "express";
import { z } from "zod";
import { BugPriority, ProjectMemberRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import {
  ensureManagerOrOwner,
  ensureOwner,
  ensureProjectReadAccess,
  getProjectAndMembership
} from "../lib/access";

const projectsRouter = Router();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const projectCreateSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(2000).optional(),
  ownerId: z.string().uuid().optional(),
  isPublic: z.boolean().optional()
});

const projectUpdateSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional()
});

const memberAddSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(ProjectMemberRole).refine((r) => r !== "owner", "Cannot add owner via API")
});

const memberUpdateSchema = z.object({
  role: z.nativeEnum(ProjectMemberRole).refine((r) => r !== "owner", "Cannot set owner via this endpoint")
});

const boardFilterSchema = z.object({
  priority: z.nativeEnum(BugPriority).optional(),
  assignedTo: z.string().uuid().optional()
});

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query);

    if (req.user?.role === "admin") {
      const items = await prisma.project.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" }
      });
      return res.json({ status: "ok", data: items });
    }

    const userId = req.user!.id;
    const items = await prisma.project.findMany({
      where: {
        OR: [
          { isPublic: true },
          { members: { some: { userId } } }
        ]
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" }
    });
    return res.json({ status: "ok", data: items });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    if (req.user?.role !== "admin") throw new HttpError(403, "Forbidden");
    const body = projectCreateSchema.parse(req.body);

    const ownerId = body.ownerId ?? req.user!.id;
    const ownerExists = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!ownerExists) throw new HttpError(400, "Owner not found");

    const project = await prisma.project.create({
      data: {
        name: body.name,
        description: body.description,
        ownerId,
        isPublic: body.isPublic ?? false,
        members: {
          create: {
            userId: ownerId,
            role: "owner"
          }
        }
      }
    });

    return res.status(201).json({ status: "ok", data: project });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const ctx = await getProjectAndMembership(projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    return res.json({ status: "ok", data: ctx.project });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.put("/:id", async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const body = projectUpdateSchema.parse(req.body);
    const ctx = await getProjectAndMembership(projectId, req.user?.id);

    if (req.user?.role !== "admin" && ctx.project.ownerId !== req.user?.id) {
      throw new HttpError(403, "Forbidden");
    }

    const updated = await prisma.project.update({ where: { id: projectId }, data: body });
    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.delete("/:id", async (req, res, next) => {
  try {
    if (req.user?.role !== "admin") throw new HttpError(403, "Forbidden");
    const projectId = req.params.id;
    await prisma.project.delete({ where: { id: projectId } });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

projectsRouter.get("/:id/members", async (req, res, next) => {
  try {
    const ctx = await getProjectAndMembership(req.params.id, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const members = await prisma.projectMember.findMany({
      where: { projectId: ctx.project.id },
      include: { user: { select: { id: true, username: true, email: true, role: true } } }
    });

    return res.json({
      status: "ok",
      data: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user
      }))
    });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.post("/:id/members", async (req, res, next) => {
  try {
    const ctx = await getProjectAndMembership(req.params.id, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);
    ensureManagerOrOwner(req.user, ctx);

    const body = memberAddSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new HttpError(400, "User not found");

    const created = await prisma.projectMember.create({
      data: {
        projectId: ctx.project.id,
        userId: body.userId,
        role: body.role
      }
    });

    return res.status(201).json({ status: "ok", data: created });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.put("/:id/members/:userId", async (req, res, next) => {
  try {
    const ctx = await getProjectAndMembership(req.params.id, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);
    ensureOwner(req.user, ctx);

    const body = memberUpdateSchema.parse(req.body);
    const userId = req.params.userId;
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: ctx.project.id, userId } }
    });
    if (!membership) throw new HttpError(404, "Membership not found");
    if (membership.role === "owner") throw new HttpError(400, "Cannot change owner role here");

    const updated = await prisma.projectMember.update({
      where: { projectId_userId: { projectId: ctx.project.id, userId } },
      data: { role: body.role }
    });

    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

projectsRouter.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    const ctx = await getProjectAndMembership(req.params.id, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);
    ensureOwner(req.user, ctx);

    const targetUserId = req.params.userId;
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: ctx.project.id, userId: targetUserId } }
    });
    if (!membership) throw new HttpError(404, "Membership not found");
    if (membership.role === "owner") throw new HttpError(400, "Cannot remove owner");

    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: ctx.project.id, userId: targetUserId } } });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

projectsRouter.get("/:id/board", async (req, res, next) => {
  try {
    const ctx = await getProjectAndMembership(req.params.id, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const filters = boardFilterSchema.parse(req.query);

    const bugs = await prisma.bug.findMany({
      where: {
        projectId: ctx.project.id,
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.assignedTo ? { assignedTo: filters.assignedTo } : {})
      },
      orderBy: { createdAt: "desc" }
    });

    const grouped = {
      new: [] as typeof bugs,
      in_progress: [] as typeof bugs,
      testing: [] as typeof bugs,
      done: [] as typeof bugs,
      closed: [] as typeof bugs
    };

    for (const b of bugs) {
      (grouped as any)[b.status].push(b);
    }

    return res.json({ status: "ok", data: grouped });
  } catch (err) {
    return next(err);
  }
});

export { projectsRouter };
