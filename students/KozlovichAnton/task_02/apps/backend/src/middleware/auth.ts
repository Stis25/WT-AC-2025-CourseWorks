import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/tokens";
import { HttpError } from "../lib/errors";

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return next(new HttpError(401, "Missing Authorization header"));
  }
  const token = header.split(" ")[1];
  const payload = verifyAccessToken(token);
  req.user = { id: payload.sub, role: payload.role };
  return next();
};
