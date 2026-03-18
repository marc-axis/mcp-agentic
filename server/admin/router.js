import { Router } from "express";
import express from "express";
import crypto from "crypto";
import { sessionMiddleware, requireAdmin } from "./auth.js";
import { loginPage } from "./pages/login.js";
import { dashboardPage } from "./pages/dashboard.js";
import { teamsPage } from "./pages/teams.js";
import { teamDetailPage } from "./pages/team-detail.js";
import { userCreatePage, userCreatedPage } from "./pages/user-create.js";
import {
  getKpis, getRecentActivity, getTeams, getTeam,
  createTeam, createUser, revokeUser, getTeamList
} from "./queries.js";

const router = Router();
const urlencoded = express.urlencoded({ extended: false });

router.use(sessionMiddleware);

// ── Login / Logout ─────────────────────────────────────────────────────────
router.get("/login", (req, res) => {
  if (req.session?.admin) return res.redirect("/admin");
  res.send(loginPage());
});

router.post("/login", urlencoded, (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.redirect("/admin");
  }
  res.send(loginPage("Incorrect password. Try again."));
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/admin/login");
});

// ── All routes below require admin session ─────────────────────────────────
router.use(requireAdmin);

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [kpis, activity] = await Promise.all([getKpis(), getRecentActivity()]);
    res.send(dashboardPage(kpis, activity));
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// ── Teams list ─────────────────────────────────────────────────────────────
router.get("/teams", async (req, res) => {
  const teams = await getTeams();
  res.send(teamsPage(teams));
});

router.post("/teams", urlencoded, async (req, res) => {
  const { name } = req.body;
  try {
    await createTeam(name.trim());
    res.redirect("/admin/teams");
  } catch (err) {
    const teams = await getTeams();
    res.send(teamsPage(teams, err.message));
  }
});

// ── Team detail ────────────────────────────────────────────────────────────
router.get("/teams/:id", async (req, res) => {
  const team = await getTeam(req.params.id);
  if (!team) return res.status(404).send("Team not found");
  res.send(teamDetailPage(team));
});

// ── Create user ────────────────────────────────────────────────────────────
router.get("/users/create", async (req, res) => {
  const teams = await getTeamList();
  res.send(userCreatePage(teams, req.query.team ?? ""));
});

router.post("/users/create", urlencoded, async (req, res) => {
  const { client_name, team_id } = req.body;
  try {
    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    await createUser(client_name.trim(), team_id || null, keyHash);
    res.send(userCreatedPage(client_name.trim(), rawKey));
  } catch (err) {
    const teams = await getTeamList();
    res.send(userCreatePage(teams, req.body.team_id ?? "", err.message));
  }
});

// ── Revoke user ────────────────────────────────────────────────────────────
router.post("/users/:id/revoke", async (req, res) => {
  await revokeUser(req.params.id);
  res.redirect("back");
});

export default router;
