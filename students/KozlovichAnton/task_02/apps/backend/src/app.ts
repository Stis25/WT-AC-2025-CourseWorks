import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { config } from "./config";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { projectsRouter } from "./routes/projects";
import { bugsRouter } from "./routes/bugs";
import { attachmentsRouter } from "./routes/attachments";
import { commentsRouter } from "./routes/comments";
import { errorHandler } from "./middleware/error-handler";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/projects", projectsRouter);
app.use("/bugs", bugsRouter);
app.use("/attachments", attachmentsRouter);
app.use("/comments", commentsRouter);

app.use(errorHandler);

export { app };
