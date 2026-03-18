import cookieSession from "cookie-session";
import crypto from "crypto";

export const sessionMiddleware = cookieSession({
  name: "aafm_admin",
  secret: process.env.ADMIN_PASSWORD ?? "dev-secret",
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  httpOnly: true,
});

export function requireAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  res.redirect("/admin/login");
}

export function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(16).toString("hex");
  }
  next();
}

export function verifyCsrf(req, res, next) {
  const token = req.body?._csrf;
  if (!token || token !== req.session?.csrfToken) {
    return res.status(403).send("Invalid or missing CSRF token.");
  }
  next();
}
