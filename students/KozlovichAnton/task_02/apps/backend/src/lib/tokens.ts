import jwt from "jsonwebtoken";
import ms from "ms";
import type { StringValue } from "ms";
import type { CookieOptions, Response } from "express";
import { config } from "../config";
import { generateJti, sha256 } from "./hash";
import { HttpError } from "./errors";

export type AccessPayload = {
  sub: string;
  role: string;
  iat: number;
  exp: number;
};

export type RefreshPayload = {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
};

const accessTtl = ms(config.JWT_ACCESS_TTL as StringValue);
const refreshTtl = ms(config.JWT_REFRESH_TTL as StringValue);

export const createAccessToken = (userId: string, role: string) => {
  return jwt.sign({ sub: userId, role }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as StringValue
  });
};

export const createRefreshToken = (userId: string, jti: string) => {
  return jwt.sign({ sub: userId, jti }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL as StringValue
  });
};

export const verifyAccessToken = (token: string): AccessPayload => {
  try {
    return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
  } catch (err) {
    throw new HttpError(401, "Invalid or expired access token");
  }
};

export const verifyRefreshToken = (token: string): RefreshPayload => {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch (err) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }
};

export const buildRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: config.isProd ? "none" : "lax",
  secure: config.isProd,
  path: "/",
  maxAge: refreshTtl,
  domain: config.REFRESH_TOKEN_COOKIE_DOMAIN
});

export const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(config.REFRESH_TOKEN_COOKIE, token, buildRefreshCookieOptions());
};

export const clearRefreshCookie = (res: Response) => {
  res.clearCookie(config.REFRESH_TOKEN_COOKIE, {
    ...buildRefreshCookieOptions(),
    maxAge: 0
  });
};

export const newRefreshJti = () => generateJti();

export const hashJti = (jti: string) => sha256(jti);

export const computeRefreshExpiry = () => new Date(Date.now() + refreshTtl);
