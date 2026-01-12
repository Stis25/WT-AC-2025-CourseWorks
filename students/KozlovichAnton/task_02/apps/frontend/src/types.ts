export type Role = "admin" | "manager" | "developer" | "user";
export type ProjectMemberRole = "owner" | "manager" | "developer" | "viewer";

export type User = {
  id: string;
  username: string;
  email: string;
  role: Role;
};

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  userId: string;
  role: ProjectMemberRole;
  joinedAt: string;
  user: User;
};

export type BugStatus = "new" | "in_progress" | "testing" | "done" | "closed";
export type BugPriority = "low" | "medium" | "high" | "critical";

export type Bug = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: BugStatus;
  priority: BugPriority;
  assignedTo?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  bugId: string;
  filename: string;
  filePath: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type Comment = {
  id: string;
  bugId: string;
  content: string;
  authorId: string;
  createdAt: string;
};

export type BoardColumns = {
  new: Bug[];
  in_progress: Bug[];
  testing: Bug[];
  done: Bug[];
  closed: Bug[];
};

export type ApiList<T> = { status: "ok"; data: T[] };
export type ApiItem<T> = { status: "ok"; data: T };
export type AuthResponse = { status: "ok"; accessToken: string; user: User };
export type ApiErrorResponse = { message?: string };
