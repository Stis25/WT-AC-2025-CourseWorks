import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../lib/password";
import { HttpError } from "../lib/errors";
import {
  clearRefreshCookie,
  computeRefreshExpiry,
  createAccessToken,
  createRefreshToken,
  hashJti,
  newRefreshJti,
  setRefreshCookie,
  verifyRefreshToken
} from "../lib/tokens";
import { config } from "../config";

const authRouter = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[A-Za-z0-9_]+$/, "Use letters, numbers, underscore"),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const issueTokens = async (userId: string, role: string, ip?: string, userAgent?: string) => {
  const jti = newRefreshJti();
  const refreshToken = createRefreshToken(userId, jti);
  const jtiHash = hashJti(jti);

  await prisma.refreshToken.create({
    data: {
      jtiHash,
      userId,
      expiresAt: computeRefreshExpiry(),
      createdByIp: ip,
      userAgent
    }
  });

  const accessToken = createAccessToken(userId, role);
  return { accessToken, refreshToken, jtiHash };
};

const revokeAllUserTokens = async (userId: string) => {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

authRouter.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const hashed = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash: hashed,
        role: "user"
      }
    });

    const tokens = await issueTokens(user.id, user.role, req.ip, req.headers["user-agent"] as string | undefined);
    setRefreshCookie(res, tokens.refreshToken);
    return res.status(201).json({ status: "ok", accessToken: tokens.accessToken, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    return next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new HttpError(401, "Invalid credentials");

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) throw new HttpError(401, "Invalid credentials");

    const tokens = await issueTokens(user.id, user.role, req.ip, req.headers["user-agent"] as string | undefined);
    setRefreshCookie(res, tokens.refreshToken);
    return res.json({ status: "ok", accessToken: tokens.accessToken, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    return next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const cookie = req.cookies?.[config.REFRESH_TOKEN_COOKIE];
    if (!cookie) throw new HttpError(401, "Refresh token not found");

    const payload = verifyRefreshToken(cookie);
    const jtiHash = hashJti(payload.jti);

    const session = await prisma.refreshToken.findUnique({ where: { jtiHash } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      await revokeAllUserTokens(payload.sub);
      clearRefreshCookie(res);
      throw new HttpError(401, "Refresh token is invalid or expired");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      await revokeAllUserTokens(payload.sub);
      clearRefreshCookie(res);
      throw new HttpError(401, "User not found");
    }

    const newJti = newRefreshJti();
    const newRefresh = createRefreshToken(user.id, newJti);
    const newHash = hashJti(newJti);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { jtiHash },
        data: { revokedAt: new Date(), replacedByToken: newHash }
      }),
      prisma.refreshToken.create({
        data: {
          jtiHash: newHash,
          userId: user.id,
          expiresAt: computeRefreshExpiry(),
          createdByIp: req.ip,
          userAgent: req.headers["user-agent"] as string | undefined
        }
      })
    ]);

    const accessToken = createAccessToken(user.id, user.role);
    setRefreshCookie(res, newRefresh);
    return res.json({ status: "ok", accessToken });
  } catch (err) {
    if (err instanceof HttpError) {
      clearRefreshCookie(res);
    }
    return next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const cookie = req.cookies?.[config.REFRESH_TOKEN_COOKIE];
    if (cookie) {
      try {
        const payload = verifyRefreshToken(cookie);
        const jtiHash = hashJti(payload.jti);
        await prisma.refreshToken.updateMany({
          where: { jtiHash, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      } catch (_err) {
        // ignore token parsing errors on logout
      }
    }
    clearRefreshCookie(res);
    return res.json({ status: "ok" });
  } catch (err) {
    return next(err);
  }
});

authRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export { authRouter };
