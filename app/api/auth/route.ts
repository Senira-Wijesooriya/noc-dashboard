import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import kv from "@/lib/redis";
import { gmailConfigured, sendOtpEmail } from "@/lib/mailer";
import { companyEmail, emailAllowed, getSession, hash, isSameOrigin, otpHash, requesterIp, SESSION_COOKIE, SESSION_SECONDS, OTP_SECONDS, token } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function sessionCookie(res: NextResponse, value: string, age: number) {
  res.cookies.set(SESSION_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: age });
}
export async function GET() {
  try {
    const user = await getSession();
    return reply({ authenticated: !!user, user });
  } catch { return reply({ authenticated: false, error: "Session service unavailable" }, 503); }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req) || !req.headers.get("content-type")?.includes("application/json")) return reply({ error: "Forbidden" }, 403);
  try {
    const body = await req.json();
    const email = companyEmail(body.email);
    if (!email) return reply({ error: "Enter a valid @mitesp.com email address." }, 400);
    if (!emailAllowed(email)) return reply({ error: "This mailbox is not authorized for the dashboard." }, 403);
    const emailKey = hash(email);
    const ipKey = hash(requesterIp(req));

    if (body.action === "request_code") {
      if (!gmailConfigured() || !process.env.OTP_HASH_SECRET || process.env.OTP_HASH_SECRET.length < 32) {
        return reply({ error: "Email verification has not been configured by the administrator." }, 503);
      }
      // Request limits reduce email flooding. A code can only be sent every 60 seconds.
      const ipCount = await kv.incr(`auth:ip_limit:${ipKey}`);
      if (ipCount === 1) await kv.expire(`auth:ip_limit:${ipKey}`, 900);
      const mailCount = await kv.incr(`auth:email_limit:${emailKey}`);
      if (mailCount === 1) await kv.expire(`auth:email_limit:${emailKey}`, 900);
      if (Number(ipCount) > 30 || Number(mailCount) > 5) return reply({ error: "Too many requests. Try again later." }, 429);
      const reserved = await kv.set(`auth:cooldown:${emailKey}`, "1", { nx: true, ex: 60 });
      if (reserved !== "OK") return reply({ error: "Please wait 60 seconds before requesting another code." }, 429);
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await kv.set(`auth:otp:${emailKey}`, JSON.stringify({ digest: otpHash(email, code), attempts: 0 }), { ex: OTP_SECONDS });
      try {
        await sendOtpEmail(email, code);
        return reply({ success: true, message: "If delivery is permitted, a 6-digit code has been sent to your work email." });
      } catch (error) {
        console.error("OTP email delivery failed:", error);
        await kv.del(`auth:otp:${emailKey}`, `auth:cooldown:${emailKey}`);
        return reply({ error: "Could not send verification email. Contact the dashboard administrator." }, 502);
      }
    }

    if (body.action === "verify_code") {
      const code = String(body.code ?? "").trim();
      if (!/^\d{6}$/.test(code)) return reply({ error: "Enter the 6-digit verification code." }, 400);
      // Verify, increment failed attempts, and consume valid code atomically.
      const lua = `local x=redis.call('GET',KEYS[1]); if not x then return 0 end; local v=cjson.decode(x); if v.digest==ARGV[1] then redis.call('DEL',KEYS[1]); return 1 end; v.attempts=(v.attempts or 0)+1; if v.attempts>=5 then redis.call('DEL',KEYS[1]) else redis.call('SET',KEYS[1],cjson.encode(v),'KEEPTTL') end; return -1`;
      const matched = Number(await kv.eval(lua, [`auth:otp:${emailKey}`], [otpHash(email, code)]));
      if (matched !== 1) return reply({ error: "Invalid or expired code. Request a new code if necessary." }, 401);
      const sessionToken = token();
      await kv.set(`auth:session:${hash(sessionToken)}`, JSON.stringify({ email, issuedAt: Date.now() }), { ex: SESSION_SECONDS });
      const res = reply({ success: true, user: { email, name: email.split("@")[0].toUpperCase() } });
      sessionCookie(res, sessionToken, SESSION_SECONDS);
      return res;
    }
    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("Authentication error:", error);
    return reply({ error: "Authentication service unavailable." }, 503);
  }
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return reply({ error: "Forbidden" }, 403);
  const { cookies } = await import("next/headers");
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (value) await kv.del(`auth:session:${hash(value)}`);
  const res = reply({ success: true });
  sessionCookie(res, "", 0);
  return res;
}
