import crypto from "crypto";

export const generateJti = () => crypto.randomUUID();

export const sha256 = (input: string) =>
  crypto.createHash("sha256").update(input).digest("hex");
