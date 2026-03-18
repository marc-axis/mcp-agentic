import cookieSession from "cookie-session";

export const sessionMiddleware = cookieSession({
  name: "aafm_admin",
  secret: process.env.ADMIN_PASSWORD ?? "dev-secret",
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
});

export function requireAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  res.redirect("/admin/login");
}
