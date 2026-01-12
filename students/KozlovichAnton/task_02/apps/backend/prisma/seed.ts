import { PrismaClient, BugPriority, BugStatus, ProjectMemberRole, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const hash = (plain: string) => bcrypt.hash(plain, 10);

async function main() {
  console.log("Seeding database...");

  // Clean existing data (order matters because of FKs)
  await prisma.refreshToken.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.bug.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const adminPwd = await hash("Admin123!");
  const managerPwd = await hash("Manager123!");
  const devPwd = await hash("Dev123!");
  const userPwd = await hash("User123!");

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: adminPwd,
      role: Role.admin
    }
  });

  const manager = await prisma.user.create({
    data: {
      username: "manager",
      email: "manager@example.com",
      passwordHash: managerPwd,
      role: Role.manager
    }
  });

  const developer = await prisma.user.create({
    data: {
      username: "dev",
      email: "dev@example.com",
      passwordHash: devPwd,
      role: Role.developer
    }
  });

  const reporter = await prisma.user.create({
    data: {
      username: "reporter",
      email: "user@example.com",
      passwordHash: userPwd,
      role: Role.user
    }
  });

  // Projects
  const publicProject = await prisma.project.create({
    data: {
      name: "Public Demo Project",
      description: "Публичный проект для демонстрации доски и фильтров",
      ownerId: admin.id,
      isPublic: true,
      members: {
        create: [
          { userId: admin.id, role: ProjectMemberRole.owner },
          { userId: manager.id, role: ProjectMemberRole.manager },
          { userId: developer.id, role: ProjectMemberRole.developer },
          { userId: reporter.id, role: ProjectMemberRole.viewer }
        ]
      }
    }
  });

  const privateProject = await prisma.project.create({
    data: {
      name: "Private Internal Project",
      description: "Закрытый проект для проверки прав доступа",
      ownerId: admin.id,
      isPublic: false,
      members: {
        create: [
          { userId: admin.id, role: ProjectMemberRole.owner },
          { userId: manager.id, role: ProjectMemberRole.manager },
          { userId: developer.id, role: ProjectMemberRole.developer }
        ]
      }
    }
  });

  // Bugs in public project
  const bug1 = await prisma.bug.create({
    data: {
      projectId: publicProject.id,
      title: "Cannot submit feedback form",
      description: "Кнопка отправки неактивна при заполненных полях",
      status: BugStatus.new,
      priority: BugPriority.high,
      createdBy: reporter.id,
      assignedTo: developer.id
    }
  });

  const bug2 = await prisma.bug.create({
    data: {
      projectId: publicProject.id,
      title: "Login page layout breaks on mobile",
      description: "Верстка едет на ширине < 400px",
      status: BugStatus.in_progress,
      priority: BugPriority.medium,
      createdBy: manager.id,
      assignedTo: developer.id
    }
  });

  // Bug in private project
  const bug3 = await prisma.bug.create({
    data: {
      projectId: privateProject.id,
      title: "API timeout on invoice fetch",
      description: "Запрос /invoices падает по таймауту > 30с",
      status: BugStatus.in_progress,
      priority: BugPriority.critical,
      createdBy: manager.id,
      assignedTo: developer.id
    }
  });

  // Attachments
  await prisma.attachment.create({
    data: {
      bugId: bug1.id,
      filename: "screenshot.png",
      filePath: "/uploads/demo/screenshot.png",
      uploadedBy: reporter.id
    }
  });

  // Comments
  await prisma.comment.createMany({
    data: [
      {
        bugId: bug1.id,
        authorId: manager.id,
        content: "Принято в работу, уточните браузер и ОС."
      },
      {
        bugId: bug3.id,
        authorId: developer.id,
        content: "Локально не воспроизводится, нужно логи с продакшна."
      }
    ]
  });

  console.log("Seed completed.");
  console.log("Users:");
  console.log("- admin@example.com / Admin123! (admin)");
  console.log("- manager@example.com / Manager123! (manager)");
  console.log("- dev@example.com / Dev123! (developer)");
  console.log("- user@example.com / User123! (user)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
