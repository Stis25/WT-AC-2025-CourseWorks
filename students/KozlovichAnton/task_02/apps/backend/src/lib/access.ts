import { ProjectMemberRole, Project } from "@prisma/client";
import { prisma } from "./prisma";
import { HttpError } from "./errors";

const roleRank: Record<ProjectMemberRole, number> = {
  owner: 3,
  manager: 2,
  developer: 1,
  viewer: 0
};

export type AuthUser = { id: string; role: string } | undefined;

type ProjectWithMembership = {
  project: Project;
  membership: { role: ProjectMemberRole } | null;
};

const hasProjectRole = (role: ProjectMemberRole | null, minRole: ProjectMemberRole) => {
  if (!role) return false;
  return roleRank[role] >= roleRank[minRole];
};

export const getProjectAndMembership = async (
  projectId: string,
  userId?: string
): Promise<ProjectWithMembership> => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Project not found");

  if (!userId) return { project, membership: null };

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true }
  });

  return { project, membership };
};

export const ensureProjectReadAccess = (user: AuthUser, ctx: ProjectWithMembership) => {
  if (user?.role === "admin") return;
  if (ctx.project.isPublic) return;
  if (ctx.membership) return;
  throw new HttpError(403, "Forbidden");
};

export const ensureProjectRole = (
  user: AuthUser,
  ctx: ProjectWithMembership,
  minRole: ProjectMemberRole
) => {
  if (user?.role === "admin") return;
  if (!ctx.membership || !hasProjectRole(ctx.membership.role, minRole)) {
    throw new HttpError(403, "Forbidden");
  }
};

export const ensureOwner = (user: AuthUser, ctx: ProjectWithMembership) => {
  ensureProjectRole(user, ctx, "owner");
};

export const ensureManagerOrOwner = (user: AuthUser, ctx: ProjectWithMembership) => {
  if (user?.role === "admin") return;
  if (!ctx.membership) throw new HttpError(403, "Forbidden");
  if (ctx.membership.role === "owner" || ctx.membership.role === "manager") return;
  throw new HttpError(403, "Forbidden");
};
