/** Passwordless company email sessions. Never trust a user-supplied email or IP. */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import kv from "@/lib/redis";

export const SESSION_COOKIE = "shipyard_session";
export const SESSION_SECONDS = 12 * 60 * 60;
export const OTP_SECONDS = 10 * 60;

export function companyEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@mitesp\.com$/.test(email) && email.length <= 254 ? email : null;
}
export function emailAllowed(email: string): boolean {
  const raw = process.env.SHIPYARD_ALLOWED_EMAILS?.trim();
  if (!raw) return true; // Default: verified @mitesp.com domain; restrict in production.
  return raw.split(",").some((value) => value.trim().toLowerCase() === email);
}
export const hash = (input: string) => createHash("sha256").update(input).digest("hex");
export function otpHash(email: string, code: string): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("OTP_HASH_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}
export function token(): string { return randomBytes(32).toString("base64url"); }
export async function getSession(): Promise<{ email: string; name: string } | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || !/^[\w-]{43}$/.test(value)) return null;
  const raw = await kv.get(`auth:session:${hash(value)}`);
  if (!raw) return null;
  try {
    const session = typeof raw === "string" ? JSON.parse(raw) : raw;
    const email = companyEmail(session?.email);
    return email && emailAllowed(email) ? { email, name: email.split("@")[0].toUpperCase() } : null;
  } catch { return null; }
}
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(req.url).host && new URL(origin).protocol === new URL(req.url).protocol; }
  catch { return false; }
}
export function requesterIp(req: Request): string {
  // Vercel sets x-real-ip. Do not accept user-submitted IPs from the request body.
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return ip.replace(/[^a-fA-F0-9.:]/g, "").slice(0, 60) || "unknown";
}
