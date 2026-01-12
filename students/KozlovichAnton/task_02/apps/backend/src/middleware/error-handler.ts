import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ status: "error", message: "Validation failed", details: err.flatten().fieldErrors });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ status: "error", message: "Resource already exists" });
    }
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ status: "error", message: err.message, details: err.details });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ status: "error", message: "Internal server error" });
};
