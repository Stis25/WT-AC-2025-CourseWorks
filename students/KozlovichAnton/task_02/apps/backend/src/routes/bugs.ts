import { Router } from "express";
import { z } from "zod";
import { BugPriority, BugStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import {
  ensureManagerOrOwner,
  ensureProjectReadAccess,
  getProjectAndMembership
} from "../lib/access";

const bugsRouter = Router();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const bugCreateSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  priority: z.nativeEnum(BugPriority).optional(),
  status: z.nativeEnum(BugStatus).optional(),
  assignedTo: z.string().uuid().optional()
});

const bugUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.nativeEnum(BugStatus).optional(),
  priority: z.nativeEnum(BugPriority).optional(),
  assignedTo: z.string().uuid().optional().nullable()
});

const assignSchema = z.object({
  assignedTo: z.string().uuid().nullable()
});

const statusSchema = z.object({
  status: z.nativeEnum(BugStatus)
});

const filtersSchema = paginationSchema.extend({
  projectId: z.string().uuid().optional(),
  status: z.nativeEnum(BugStatus).optional(),
  priority: z.nativeEnum(BugPriority).optional(),
  assignedTo: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional()
});

bugsRouter.use(requireAuth);

bugsRouter.get("/", async (req, res, next) => {
  try {
    const { limit, offset, projectId, status, priority, assignedTo, createdBy } = filtersSchema.parse(req.query);

    if (req.user?.role === "admin") {
      const items = await prisma.bug.findMany({
        where: { projectId, status, priority, assignedTo, createdBy },
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" }
      });
      return res.json({ status: "ok", data: items });
    }

    const userId = req.user!.id;
    const items = await prisma.bug.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(createdBy ? { createdBy } : {}),
        project: {
          OR: [
            { isPublic: true },
            { members: { some: { userId } } }
          ]
        }
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

bugsRouter.post("/", async (req, res, next) => {
  try {
    const body = bugCreateSchema.parse(req.body);
    const ctx = await getProjectAndMembership(body.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    if (!ctx.project.isPublic && ctx.membership === null && req.user?.role !== "admin") {
      throw new HttpError(403, "Forbidden");
    }

    if (body.assignedTo) {
      const target = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: body.projectId, userId: body.assignedTo } }
      });
      if (!target || target.role !== "developer") {
        throw new HttpError(400, "Assignee must be a project developer");
      }
    }

    const bug = await prisma.bug.create({
      data: {
        projectId: body.projectId,
        title: body.title,
        description: body.description,
        status: body.status ?? "new",
        priority: body.priority ?? "medium",
        assignedTo: body.assignedTo ?? null,
        createdBy: req.user!.id
      }
    });

    return res.status(201).json({ status: "ok", data: bug });
  } catch (err) {
    return next(err);
  }
});

bugsRouter.get("/:id", async (req, res, next) => {
  try {
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        attachments: true,
        comments: true
      }
    });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);
    return res.json({ status: "ok", data: bug });
  } catch (err) {
    return next(err);
  }
});

bugsRouter.put("/:id", async (req, res, next) => {
  try {
    const body = bugUpdateSchema.parse(req.body);
    const bug = await prisma.bug.findUnique({ where: { id: req.params.id } });
    if (!bug) throw new HttpError(404, "Bug not found");

    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const isAdmin = req.user?.role === "admin";
    const isOwnerOrManager = ctx.membership?.role === "owner" || ctx.membership?.role === "manager";
    const isAssignee = bug.assignedTo === req.user?.id;
    const isAuthor = bug.createdBy === req.user?.id;

    if (!isAdmin && !isOwnerOrManager && !(isAssignee || isAuthor)) {
      throw new HttpError(403, "Forbidden");
    }

    // Field-level restrictions
    if (!isAdmin && !isOwnerOrManager) {
      const data: Record<string, unknown> = {};
      if (body.description !== undefined) data.description = body.description;
      if (isAssignee && body.status !== undefined) data.status = body.status;
      const updated = await prisma.bug.update({ where: { id: bug.id }, data });
      return res.json({ status: "ok", data: updated });
    }

    if (body.assignedTo) {
      const target = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: bug.projectId, userId: body.assignedTo } }
      });
      if (!target || target.role !== "developer") {
        throw new HttpError(400, "Assignee must be a project developer");
      }
    }

    const updated = await prisma.bug.update({
      where: { id: bug.id },
      data: {
        title: body.title ?? bug.title,
        description: body.description ?? bug.description,
        status: body.status ?? bug.status,
        priority: body.priority ?? bug.priority,
        assignedTo: body.assignedTo !== undefined ? body.assignedTo : bug.assignedTo
      }
    });

    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

bugsRouter.delete("/:id", async (req, res, next) => {
  try {
    const bug = await prisma.bug.findUnique({ where: { id: req.params.id } });
    if (!bug) throw new HttpError(404, "Bug not found");

    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);
    const isAdmin = req.user?.role === "admin";
    const isOwnerOrManager = ctx.membership?.role === "owner" || ctx.membership?.role === "manager";
    if (!isAdmin && !isOwnerOrManager) throw new HttpError(403, "Forbidden");

    await prisma.bug.delete({ where: { id: bug.id } });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

bugsRouter.patch("/:id/assign", async (req, res, next) => {
  try {
    const body = assignSchema.parse(req.body);
    const bug = await prisma.bug.findUnique({ where: { id: req.params.id } });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureManagerOrOwner(req.user, ctx);

    if (body.assignedTo) {
      const target = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: bug.projectId, userId: body.assignedTo } }
      });
      if (!target || target.role !== "developer") {
        throw new HttpError(400, "Assignee must be a project developer");
      }
    }

    const updated = await prisma.bug.update({
      where: { id: bug.id },
      data: { assignedTo: body.assignedTo }
    });
    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

bugsRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const body = statusSchema.parse(req.body);
    const bug = await prisma.bug.findUnique({ where: { id: req.params.id } });
    if (!bug) throw new HttpError(404, "Bug not found");
    const ctx = await getProjectAndMembership(bug.projectId, req.user?.id);
    ensureProjectReadAccess(req.user, ctx);

    const isAdmin = req.user?.role === "admin";
    const isOwnerOrManager = ctx.membership?.role === "owner" || ctx.membership?.role === "manager";
    const isAssignee = bug.assignedTo === req.user?.id;

    if (!isAdmin && !isOwnerOrManager && !isAssignee) throw new HttpError(403, "Forbidden");

    const updated = await prisma.bug.update({
      where: { id: bug.id },
      data: { status: body.status }
    });
    return res.json({ status: "ok", data: updated });
  } catch (err) {
    return next(err);
  }
});

export { bugsRouter };
