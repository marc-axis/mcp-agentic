/**
 * AAFM Hosted MCP Server — Tool definitions and handler dispatch
 * Ported from the local stdio server (v1.2.2) to use Supabase state layer.
 *
 * All file-based feature state, run logs, and artifacts are replaced with
 * Supabase queries. Prompts are still read from disk (deployed with the server).
 */

// ── Imports ───────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadFeature,
  saveFeature,
  appendRunLog,
  getRunLog,
  saveArtifact,
  getArtifactBySlug,
} from "../db/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(__filename);
// Prompts live on disk, deployed alongside the server under aafm-mcp/prompts/
const PROMPTS_DIR = path.resolve(SERVER_DIR, "../../aafm-mcp/prompts");

// ── Phase constants ───────────────────────────────────────────────────────
const PHASES = ["pre-flight", "P41", "P41-human-review", "P42", "P43", "P44", "complete"];
const PHASE_PROMPT_FILES = {
  "pre-flight": "preflight.md",
  P41: "P41-plan.md",
  P42: "P42-build.md",
  P43: "P43-todo.md",
  P44: "P44-implement.md",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function now() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function elapsedMinutes(startedAt) {
  const start = new Date(startedAt.replace(" ", "T"));
  return Math.floor((Date.now() - start.getTime()) / 60000);
}

function text(str) {
  return { content: [{ type: "text", text: str }] };
}

function loadPromptTemplate(phase, featureData) {
  const promptFile = path.join(PROMPTS_DIR, PHASE_PROMPT_FILES[phase] || "");
  if (!fs.existsSync(promptFile)) return `[Prompt template not found: ${promptFile}]`;

  let template = fs.readFileSync(promptFile, "utf-8");
  const input = featureData.feature_input || {};

  template = template
    .replace(/\{\{FEATURE_NAME\}\}/g, featureData.feature_name || "")
    .replace(/\{\{FEATURE_SLUG\}\}/g, featureData.feature_slug || "")
    .replace(/\{\{FEATURE_FOLDER_PATH\}\}/g, "")  // no local folder in hosted version
    .replace(/\{\{USER_STORY\}\}/g, featureData.user_story || "")
    .replace(/\{\{USER_STORY_PATH\}\}/g, "")  // no file path in hosted version
    .replace(/\{\{PLAN_FILE_NAME\}\}/g, featureData.plan_file_name || "Plan.md")
    .replace(/\{\{TARGET_REPO_PATH\}\}/g, featureData.target_repo_path || "(not provided — AI must ask)")
    .replace(/\{\{CONVERGENCE_RUNS\}\}/g, String(featureData.convergence_runs || 3))
    .replace(/\{\{FEATURE_OVERVIEW\}\}/g, input.overview || "(not provided)")
    .replace(/\{\{REPOSITORIES_AFFECTED\}\}/g, input.repositories_affected || "(not provided — use target repo path above)")
    .replace(/\{\{SUPPORT_DOCUMENTATION\}\}/g, input.support_documentation || "None")
    .replace(/\{\{FEATURE_CONSTRAINTS\}\}/g, input.constraints || "None")
    .replace(/\{\{TRACEABILITY_REFS\}\}/g, input.traceability_refs || "None");

  return template;
}

/**
 * Push content string to a GitHub file.
 * Accepts content directly (no local file path needed).
 *
 * @param {string} token      - GitHub personal access token
 * @param {string} repoUrl    - GitHub repo URL, e.g. https://github.com/owner/repo.git
 * @param {string} filename   - Path inside the repo, e.g. "Feature-Run-Log.md"
 * @param {string} content    - File content to write
 * @returns {{ ok: boolean, url?: string, reason?: string }}
 */
async function pushToGitHub(token, repoUrl, filename, content) {
  try {
    if (!token) {
      return { ok: false, reason: "No GitHub token provided. Pass github_token when calling start_feature." };
    }

    const urlMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!urlMatch) return { ok: false, reason: `Cannot parse owner/repo from: ${repoUrl}` };
    const owner = urlMatch[1];
    const repo = urlMatch[2].replace(/\.git$/, "");

    const contentBase64 = Buffer.from(content, "utf-8").toString("base64");
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "AAFM-Pipeline/2.0",
    };

    // Check if file already exists to get its SHA (required for updates)
    let sha = null;
    const getResp = await fetch(apiBase, { method: "GET", headers });
    if (getResp.ok) {
      const existing = await getResp.json();
      sha = existing.sha;
    } else if (getResp.status !== 404) {
      return { ok: false, reason: `GitHub API GET failed: ${getResp.status} ${getResp.statusText}` };
    }

    const body = {
      message: `chore: update ${filename} [aafm]`,
      content: contentBase64,
      ...(sha ? { sha } : {}),
    };
    const putResp = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!putResp.ok) {
      const errBody = await putResp.text();
      return { ok: false, reason: `GitHub API PUT failed: ${putResp.status} ${putResp.statusText} — ${errBody}` };
    }

    const result = await putResp.json();
    const fileUrl = result?.content?.html_url || `https://github.com/${owner}/${repo}/blob/main/${filename}`;
    return { ok: true, url: fileUrl };
  } catch (err) {
    return { ok: false, reason: `Unexpected error: ${err.message}` };
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────
export const TOOLS = [
  {
    name: "check_user_story",
    description:
      "OPTIONAL STEP 0 — Analyse a user story for clarity, scope, success criteria, and hidden assumptions before committing to planning. No feature is created. Call this as many times as needed while refining the story.\n\n" +
      "STOP. Before calling this tool you MUST ask the developer exactly this question as a separate message and wait for their reply:\n\n" +
      "'Please paste your full user story text.'\n\n" +
      "Do NOT proceed until the developer has pasted their user story in their reply. Do NOT infer, guess, or suggest content from any prior conversation.",
    inputSchema: {
      type: "object",
      properties: {
        user_story: {
          type: "string",
          description: "The full user story text to analyse.",
        },
      },
      required: ["user_story"],
    },
  },
  {
    name: "start_feature",
    description:
      "Start a new feature run. BEFORE calling this tool, ask the developer ALL of the following questions in a SINGLE message and wait for a SINGLE reply:\n\n" +
      "1. What is the feature name? (human-readable, e.g. 'Display Game Rules')\n" +
      "2. Please paste your full user story text.\n" +
      "3. What is the full path to the target repository root? (e.g. C:\\Projects\\snake-game)\n" +
      "4. How many convergence runs? (1=fast, 3=standard, 5=high confidence)\n" +
      "5. What is your name? (recorded as developer for this feature run)\n" +
      "6. One sentence overview of what this feature does? (optional — leave blank if not needed)\n" +
      "7. (Optional) GitHub Personal Access Token for PR creation and log pushing?\n\n" +
      "After receiving the developer's answers:\n\n" +
      "Step 1 — Folder name confirmation loop:\n" +
      "Derive a suggested folder name (lowercase, spaces→hyphens, trim). Ask exactly: 'Suggested folder name: <suggested> — is this correct? (Yes / No)'\n" +
      "- Yes → folder name confirmed\n" +
      "- No → ask: 'Please type your preferred folder name:' → echo back: 'Folder name: <typed> — is this correct? (Yes / No)' → repeat until Yes\n" +
      "Use EXACTLY the confirmed name — do not reformat.\n\n" +
      "Step 2 — Values confirmation loop:\n" +
      "Present all collected values in a single summary. Ask exactly: 'All values confirmed? (Yes / No)'\n" +
      "- Yes → call this tool immediately\n" +
      "- No → ask: 'Which value would you like to correct?' → collect correction → re-present full summary → ask again\n\n" +
      "Only call this tool once the developer has answered Yes to the values confirmation. Do not infer any value.\n\n" +
      "AFTER the tool returns: Display the initialisation panel to the developer, then immediately call get_phase_prompt with the feature slug and 'P41' to load the planning prompt. Do not begin P41 until get_phase_prompt has been called.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: { type: "string", description: "Short human-readable feature name." },
        user_story: { type: "string", description: "The full user story text." },
        target_repo_path: {
          type: "string",
          description: "Local path to the target repository the feature will be implemented in, e.g. C:\\Projects\\customer-portal",
        },
        convergence_runs: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Number of independent plans to generate for Convergent Deduction (1–10). 1=no comparison, 3=standard, 5=high confidence, 10=maximum. Defaults to 3.",
        },
        plan_file_name: { type: "string", description: "OPTIONAL — name for the Plan file. Defaults to Plan.md." },
        feature_folder_name: {
          type: "string",
          description: "Name for the feature folder (kebab-case). Used as the feature slug. e.g. move-score-display.",
        },
        overview: { type: "string", description: "OPTIONAL — one sentence describing what this feature does." },
        repositories_affected: { type: "string", description: "OPTIONAL — list of repos if more than one is involved." },
        support_documentation: { type: "string", description: "OPTIONAL — paths or URLs to reference docs the AI should consult." },
        constraints: { type: "string", description: "OPTIONAL — feature-specific constraints." },
        traceability_refs: { type: "string", description: "OPTIONAL — Ref numbers mapped to requirements." },
        github_token: {
          type: "string",
          description: "OPTIONAL — GitHub Personal Access Token for PR creation and run log pushing. Stored securely in feature state.",
        },
      },
      required: ["feature_name", "user_story", "target_repo_path", "convergence_runs", "feature_folder_name"],
    },
  },
  {
    name: "get_phase_prompt",
    description:
      "Get the full prompt for the specified phase, pre-populated with user story, feature input, and project context. Paste into a fresh chat session.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        phase: { type: "string", enum: ["pre-flight", "P41", "P42", "P43", "P44"] },
      },
      required: ["feature_slug", "phase"],
    },
  },
  {
    name: "record_gate_result",
    description: "Record a phase gate result (PASS or FAIL). Appends to run-log and updates feature state.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        phase: { type: "string", enum: ["pre-flight", "P41", "P42", "P43", "P44"] },
        result: { type: "string", enum: ["PASS", "FAIL"] },
        criteria_table: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["feature_slug", "phase", "result", "criteria_table", "feedback"],
    },
  },
  {
    name: "log_iteration",
    description: "Log what the AI changed between gate attempts. Call before re-running a gate after a FAIL.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        phase: { type: "string" },
        attempt_number: { type: "integer" },
        what_changed: { type: "string" },
      },
      required: ["feature_slug", "phase", "attempt_number", "what_changed"],
    },
  },
  {
    name: "advance_phase",
    description:
      "Advance the feature to the next phase. Blocked after P41 passes — human must call approve_plan first. Also validates artifact exists for phases that produce one.",
    inputSchema: {
      type: "object",
      properties: { feature_slug: { type: "string" } },
      required: ["feature_slug"],
    },
  },
  {
    name: "approve_plan",
    description:
      "HUMAN GATE 1 — Developer approves the P41 plan after reviewing it. This is the mandatory human decision point. The pipeline cannot proceed to P42 without this approval.\n\n" +
      "IMPORTANT: Only call this tool when the developer has explicitly typed the exact phrase 'Call approve_plan' in chat. Do not call this tool on the basis of a clarification answer, an implied agreement, test results, comments, or any other conversational exchange. If the developer types anything other than the exact trigger phrase, restate the gate panel and wait.\n\n" +
      "Before calling this tool, ask the developer: 'Please type your name to confirm approval:' — do not pre-fill, do not infer, do not suggest a name from context.\n\n" +
      "After approval: immediately call advance_phase, then get_phase_prompt for P42, then begin P42 — do not pause or ask the developer.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        reviewer_name: { type: "string", description: "Name of the developer approving the plan." },
        review_notes: { type: "string", description: "Optional notes from the review." },
      },
      required: ["feature_slug", "reviewer_name"],
    },
  },
  {
    name: "reject_plan",
    description:
      "HUMAN GATE 1 — Developer rejects the P41 plan and provides feedback for revision.\n\n" +
      "IMPORTANT: Only call this tool when the developer has explicitly typed the exact phrase 'Call reject_plan' in chat. Any other message must not trigger this tool.\n\n" +
      "Before calling this tool, ask: 'Please type your name:' then 'What specific feedback should the AI use to revise the plan?' — do not infer either value.\n\n" +
      "After rejection: the AI must revise Plan.md, re-run the plan gate, and return to the developer for explicit approval. The developer must type 'Call approve_plan' before the pipeline can advance.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        reviewer_name: { type: "string" },
        rejection_reason: { type: "string", description: "Specific feedback explaining what must change." },
      },
      required: ["feature_slug", "reviewer_name", "rejection_reason"],
    },
  },
  {
    name: "approve_implementation",
    description:
      "HUMAN GATE 2 — Developer approves the P44 implementation after reviewing it. The pipeline cannot complete without this approval.\n\n" +
      "IMPORTANT: Only call this tool when the developer has explicitly typed the exact phrase 'Call approve_implementation' in chat. Do not call this tool on the basis of test results, manual verification notes, expressions of approval, or any other message. If the developer types anything other than the exact trigger phrase — including 'PASS', 'looks good', 'manual test PASS', or similar — restate the gate panel and wait.\n\n" +
      "Before calling this tool, ask the developer: 'Please type your name to confirm approval:' — do not pre-fill, do not infer, do not suggest a name from context.\n\n" +
      "After approval: ask the developer 'Do you want me to create a Pull Request now? (yes / no)'. If yes, call create_pr. If no, call complete_feature when the developer provides the PR URL manually. Do not proceed to PR creation without an explicit 'yes'.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        reviewer_name: {
          type: "string",
          description: "Name typed by the developer to confirm approval — must not be inferred.",
        },
        review_notes: { type: "string", description: "Optional notes from the review." },
      },
      required: ["feature_slug", "reviewer_name"],
    },
  },
  {
    name: "reject_implementation",
    description:
      "HUMAN GATE 2 — Developer rejects the P44 implementation and provides feedback for revision.\n\n" +
      "IMPORTANT: Only call this tool when the developer has explicitly typed the exact phrase 'Call reject_implementation' in chat.\n\n" +
      "Before calling this tool, ask: 'Please type your name:' then 'What specific changes are needed?' — do not infer either value.\n\n" +
      "After rejection: the AI must fix the implementation, re-run the implementation gate, commit and push the fixes, then return to the developer for explicit approval.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        reviewer_name: { type: "string" },
        rejection_reason: { type: "string", description: "Specific feedback explaining what must change." },
      },
      required: ["feature_slug", "reviewer_name", "rejection_reason"],
    },
  },
  {
    name: "create_pr",
    description:
      "Create a Pull Request on GitHub via the GitHub REST API. Uses the github_token stored in feature state (provided at start_feature time) and target_repo_path for owner/repo resolution. Reads the current branch name from git. Presents the branch name to the developer for confirmation before opening the PR.\n\n" +
      "Requires the github_token to have 'pull_requests: write' (fine-grained PAT) or 'repo' scope (classic PAT).\n\n" +
      "Call this only after approve_implementation and only if the developer explicitly said yes to PR creation.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        title: { type: "string", description: "PR title." },
        body: { type: "string", description: "PR description (markdown)." },
        base_branch: { type: "string", description: "The branch to merge into. Defaults to 'main'." },
        head_branch: {
          type: "string",
          description: "The branch to merge from (the feature branch). If not provided, the server reads the current branch from git in the target repo.",
        },
        github_repo_url: {
          type: "string",
          description: "GitHub repository URL (e.g. https://github.com/owner/repo). Required if not inferable from target_repo_path.",
        },
      },
      required: ["feature_slug", "title", "body"],
    },
  },
  {
    name: "get_run_status",
    description: "Get current status of a feature run: phase, attempt counts, elapsed time, human approval status.",
    inputSchema: {
      type: "object",
      properties: { feature_slug: { type: "string" } },
      required: ["feature_slug"],
    },
  },
  {
    name: "complete_feature",
    description: "Mark feature complete. Records PR URL, calculates duration, appends summary to run log.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string" },
        pr_url: { type: "string" },
      },
      required: ["feature_slug", "pr_url"],
    },
  },
  {
    name: "get_run_log",
    description: "Return the full run log for a feature.",
    inputSchema: {
      type: "object",
      properties: { feature_slug: { type: "string" } },
      required: ["feature_slug"],
    },
  },
  {
    name: "push_run_log",
    description:
      "Manually push the feature run log to GitHub. Use this if the automatic push failed at complete_feature time, or if you were offline. Requires github_token and github_repo_url.",
    inputSchema: {
      type: "object",
      properties: {
        feature_slug: { type: "string", description: "The completed feature slug." },
        github_repo_url: {
          type: "string",
          description: "GitHub repository URL where the log should be pushed (e.g. https://github.com/owner/repo).",
        },
        github_log_filename: {
          type: "string",
          description: "Filename to write in the repo (e.g. Feature-Run-Log.md). Defaults to 'Feature-Run-Log.md'.",
        },
      },
      required: ["feature_slug"],
    },
  },
];

// ── Tool handler dispatch ─────────────────────────────────────────────────

/**
 * Handle an MCP tool call.
 *
 * @param {string} toolName
 * @param {object} args
 * @param {string} apiKeyId  - Supabase api_key row ID, scopes all state
 * @returns {Promise<{ content: Array<{ type: string, text: string }> }>}
 */
export async function handleToolCall(toolName, args, apiKeyId) {
  try {
    // ── check_user_story ──────────────────────────────────────────────────
    if (toolName === "check_user_story") {
      const user_story = args.user_story?.trim();
      if (!user_story) {
        return text("ERROR: user_story is required and must not be empty.");
      }

      const promptFile = path.join(PROMPTS_DIR, "preflight.md");
      if (!fs.existsSync(promptFile)) {
        return text(`ERROR: Pre-flight prompt template not found at ${promptFile}`);
      }

      const prompt = fs.readFileSync(promptFile, "utf-8")
        .replace(/\{\{USER_STORY\}\}/g, user_story)
        .replace(/\{\{USER_STORY_PATH\}\}/g, "");

      return text(
        `--- USER STORY ANALYSIS PROMPT ---\n\n` +
        `This is OPTIONAL STEP 0. No feature has been created. ` +
        `Review the analysis, refine your story if needed, then call start_feature when ready.\n\n` +
        `${prompt}`
      );
    }

    // ── start_feature ─────────────────────────────────────────────────────
    if (toolName === "start_feature") {
      const {
        feature_name,
        user_story,
        target_repo_path = "",
        convergence_runs = 3,
        plan_file_name = "Plan.md",
        feature_folder_name,
        overview = "",
        repositories_affected = "",
        support_documentation = "None",
        constraints = "None",
        traceability_refs = "None",
        github_token = null,
      } = args;

      const us = user_story?.trim();
      if (!us) {
        return text("ERROR: user_story is required and must not be empty.");
      }

      const runs = Math.max(1, Math.min(10, parseInt(convergence_runs) || 3));
      const slug = slugify(feature_folder_name);

      // Check if feature already exists
      try {
        await loadFeature(apiKeyId, slug);
        return text(`ERROR: Feature '${slug}' already exists. Use get_run_status to check its state.`);
      } catch {
        // Feature does not exist — proceed
      }

      const featureData = {
        feature_name,
        feature_slug: slug,
        user_story: us,
        plan_file_name,
        target_repo_path,
        convergence_runs: runs,
        github_token,
        feature_input: {
          overview,
          repositories_affected,
          support_documentation,
          constraints,
          traceability_refs,
        },
        current_phase: "P41",
        status: "in-progress",
        human_approval: { status: "pending", approved_by: null, approved_at: null, review_notes: null },
        started_at: now(),
        completed_at: null,
        pr_url: null,
        phase_attempts: { "pre-flight": 0, P41: 0, P42: 0, P43: 0, P44: 0 },
        phase_results: { "pre-flight": null, P41: null, P42: null, P43: null, P44: null },
      };

      await saveFeature(apiKeyId, slug, featureData);

      await appendRunLog(
        apiKeyId,
        slug,
        `# Run Log: ${feature_name}\n**Started:** ${now()}\n**Slug:** ${slug}\n**Plan File:** ${plan_file_name}\n**Target Repo:** ${target_repo_path}\n**Convergence Runs:** ${runs}\n\n---\n\n`
      );

      return text(
        `╔══════════════════════════════════════════════════════╗\n` +
        `║         AAFM — Feature Initialised                  ║\n` +
        `╚══════════════════════════════════════════════════════╝\n\n` +
        `  Feature Name:    ${feature_name}\n` +
        `  Feature Folder:  ${slug}\n` +
        `  Target Repo:     ${target_repo_path}\n` +
        `  Convergence:     ${runs} independent plan(s)\n` +
        `  GitHub Token:    ${github_token ? "provided ✓" : "not provided (PR creation and log push unavailable)"}\n\n` +
        `  ✓ Feature state saved to Supabase\n` +
        `  ✓ Run log initialised\n\n` +
        `╔══════════════════════════════════════════════════════╗\n` +
        `║  NEXT STEP — Begin Planning (P41)                    ║\n` +
        `╚══════════════════════════════════════════════════════╝\n\n` +
        `  ▶ Call get_phase_prompt('${slug}', 'P41') to load the\n` +
        `    planning prompt and begin Convergent Deduction.\n\n` +
        `  Do NOT begin P41 until you have called get_phase_prompt.\n` +
        `  Display this panel to the developer before proceeding.\n`
      );
    }

    // ── get_phase_prompt ──────────────────────────────────────────────────
    if (toolName === "get_phase_prompt") {
      const { feature_slug: slug, phase } = args;
      const featureData = await loadFeature(apiKeyId, slug);
      let artifactContents = "";

      if (phase === "P42") {
        const planContent = await getArtifactBySlug(apiKeyId, slug, "plan");
        if (planContent) {
          artifactContents = `\n\n---\n## ${featureData.plan_file_name || "Plan.md"} (reference)\n\n${planContent}`;
        }
      } else if (phase === "P43") {
        const buildContent = await getArtifactBySlug(apiKeyId, slug, "build");
        if (buildContent) {
          artifactContents = `\n\n---\n## Build.md (reference)\n\n${buildContent}`;
        }
      } else if (phase === "P44") {
        const parts = [];
        const planContent = await getArtifactBySlug(apiKeyId, slug, "plan");
        if (planContent) parts.push(`## ${featureData.plan_file_name || "Plan.md"}\n\n${planContent}`);
        const buildContent = await getArtifactBySlug(apiKeyId, slug, "build");
        if (buildContent) parts.push(`## Build.md\n\n${buildContent}`);
        const todoContent = await getArtifactBySlug(apiKeyId, slug, "todo");
        if (todoContent) parts.push(`## ToDo.md\n\n${todoContent}`);
        if (parts.length) artifactContents = "\n\n---\n" + parts.join("\n\n---\n");
      }

      const prompt = loadPromptTemplate(phase, featureData);
      return text(`${prompt}${artifactContents}`);
    }

    // ── record_gate_result ────────────────────────────────────────────────
    if (toolName === "record_gate_result") {
      const { feature_slug: slug, phase, result, criteria_table = "", feedback = "" } = args;
      const featureData = await loadFeature(apiKeyId, slug);
      featureData.phase_attempts[phase] = (featureData.phase_attempts[phase] || 0) + 1;
      const attempt = featureData.phase_attempts[phase];
      featureData.phase_results[phase] = result;
      await saveFeature(apiKeyId, slug, featureData);

      let logEntry =
        `## ${phase} — Attempt ${attempt}\n**Timestamp:** ${now()}\n**Gate Result:** ${result}\n\n` +
        `### Criteria Checked\n${criteria_table}\n`;
      if (result === "FAIL" && feedback) logEntry += `\n### Feedback\n${feedback}\n`;
      logEntry += "\n---\n\n";
      await appendRunLog(apiKeyId, slug, logEntry);

      // After P41 PASS — inform that human gate is next
      if (phase === "P41" && result === "PASS") {
        return text(
          `P41 phase gate PASSED.\n\n` +
          `⚠ PIPELINE PAUSED — HUMAN REVIEW REQUIRED\n\n` +
          `The developer must now review ${featureData.plan_file_name || "Plan.md"} before implementation proceeds.\n\n` +
          `To approve: call approve_plan('${slug}', reviewer_name, optional_notes)\n` +
          `To reject:  call reject_plan('${slug}', reviewer_name, rejection_reason)\n\n` +
          `advance_phase is BLOCKED until approve_plan is called.`
        );
      }

      // After P44 PASS — display Gate 2 panel and await human trigger phrase
      if (phase === "P44" && result === "PASS") {
        return text(
          `P44 phase gate PASSED.\n\n` +
          `╔══════════════════════════════════════════════════════╗\n` +
          `║  GATE 2 — Implementation Review                     ║\n` +
          `╚══════════════════════════════════════════════════════╝\n\n` +
          `  Feature:  ${featureData.feature_name}\n` +
          `  Phase:    P44 — Implementation\n` +
          `  Slug:     ${slug}\n\n` +
          `  Phase gate: PASS ✓\n` +
          `  All criteria met. Commit and push: CONFIRMED ✓\n\n` +
          `  ▶ Review the implementation and Lessons-Learned.md.\n` +
          `  ▶ Type exactly 'Call approve_implementation' to approve.\n` +
          `  ▶ Type exactly 'Call reject_implementation' to request changes.\n\n` +
          `  ✗ Any other response — including test results, comments,\n` +
          `    "PASS", "looks good", or any expression of approval —\n` +
          `    will NOT advance the gate.\n` +
          `    Only the exact trigger phrase above will proceed.\n\n` +
          `complete_feature is BLOCKED until approve_implementation is called.`
        );
      }

      const nextAction =
        result === "PASS"
          ? `Gate PASS. Call advance_phase('${slug}') to proceed to next phase.`
          : `Gate FAIL. Address feedback, update artifact, then call record_gate_result again.`;
      return text(nextAction);
    }

    // ── approve_plan ──────────────────────────────────────────────────────
    if (toolName === "approve_plan") {
      const { feature_slug: slug, reviewer_name, review_notes = "" } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      if (featureData.phase_results["P41"] !== "PASS") {
        return text(
          `ERROR: Cannot approve — P41 phase gate has not PASSED yet. Current result: ${featureData.phase_results["P41"]}`
        );
      }
      if (
        featureData.current_phase !== "P41" &&
        featureData.current_phase !== "P41-human-review"
      ) {
        return text(
          `ERROR: Feature is not at the P41 human review stage. Current phase: ${featureData.current_phase}`
        );
      }

      featureData.human_approval = {
        status: "approved",
        approved_by: reviewer_name,
        approved_at: now(),
        review_notes: review_notes || "No notes provided.",
      };
      featureData.current_phase = "P41-approved";
      await saveFeature(apiKeyId, slug, featureData);

      await appendRunLog(
        apiKeyId,
        slug,
        `## P41 — Human Review: APPROVED\n` +
        `**Timestamp:** ${now()}\n` +
        `**Approved By:** ${reviewer_name}\n` +
        `**Notes:** ${review_notes || "None"}\n\n---\n\n`
      );

      return text(
        `Plan approved by ${reviewer_name}.\n\n` +
        `Pipeline unblocked. Immediately call advance_phase('${slug}'), ` +
        `then call get_phase_prompt('${slug}', 'P42'), then begin P42 — do not pause.`
      );
    }

    // ── reject_plan ───────────────────────────────────────────────────────
    if (toolName === "reject_plan") {
      const { feature_slug: slug, reviewer_name, rejection_reason } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      featureData.human_approval = {
        status: "rejected",
        approved_by: null,
        approved_at: null,
        review_notes: rejection_reason,
      };
      featureData.phase_results["P41"] = null;
      featureData.current_phase = "P41";
      await saveFeature(apiKeyId, slug, featureData);

      await appendRunLog(
        apiKeyId,
        slug,
        `## P41 — Human Review: REJECTED\n` +
        `**Timestamp:** ${now()}\n` +
        `**Rejected By:** ${reviewer_name}\n` +
        `**Reason:** ${rejection_reason}\n\n---\n\n`
      );

      return text(
        `Plan rejected by ${reviewer_name}.\n\n` +
        `Reason: ${rejection_reason}\n\n` +
        `The AI must revise ${featureData.plan_file_name || "Plan.md"} per this feedback, ` +
        `then re-run the plan gate, then await human review again.\n\n` +
        `Call get_phase_prompt('${slug}', 'P41') to get the P41 prompt with full context for revision.`
      );
    }

    // ── approve_implementation ────────────────────────────────────────────
    if (toolName === "approve_implementation") {
      const { feature_slug: slug, reviewer_name, review_notes = "" } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      if (featureData.phase_results["P44"] !== "PASS") {
        return text(
          `ERROR: Cannot approve — P44 phase gate has not PASSED yet. Current result: ${featureData.phase_results["P44"]}`
        );
      }
      if (
        featureData.current_phase !== "P44" &&
        featureData.current_phase !== "P44-human-review"
      ) {
        return text(
          `ERROR: Feature is not at the P44 human review stage. Current phase: ${featureData.current_phase}`
        );
      }

      featureData.implementation_approval = {
        status: "approved",
        approved_by: reviewer_name,
        approved_at: now(),
        review_notes: review_notes || "No notes provided.",
      };
      featureData.current_phase = "P44-approved";
      await saveFeature(apiKeyId, slug, featureData);

      await appendRunLog(
        apiKeyId,
        slug,
        `## P44 — Human Review: APPROVED\n` +
        `**Timestamp:** ${now()}\n` +
        `**Approved By:** ${reviewer_name}\n` +
        `**Notes:** ${review_notes || "None"}\n\n---\n\n`
      );

      return text(
        `╔══════════════════════════════════════════════════════╗\n` +
        `║  GATE 2 — Implementation Approved                   ║\n` +
        `╚══════════════════════════════════════════════════════╝\n\n` +
        `  ✓ Approved by: ${reviewer_name}\n` +
        `  ✓ Phase: P44\n` +
        `  ✓ Feature: ${featureData.feature_name}\n\n` +
        `  ▶ Next step: Ask the developer:\n` +
        `    "Do you want me to create a Pull Request now? (yes / no)"\n\n` +
        `  If yes  → call create_pr with the feature slug, PR title, and body\n` +
        `  If no   → wait for the developer to provide a PR URL manually,\n` +
        `            then call complete_feature with that URL\n\n` +
        `  ✗ Do NOT proceed to PR creation without an explicit "yes" from the developer.\n` +
        `  ✗ Do NOT use a placeholder URL under any circumstances.\n`
      );
    }

    // ── reject_implementation ─────────────────────────────────────────────
    if (toolName === "reject_implementation") {
      const { feature_slug: slug, reviewer_name, rejection_reason } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      featureData.implementation_approval = {
        status: "rejected",
        approved_by: null,
        approved_at: null,
        review_notes: rejection_reason,
      };
      featureData.phase_results["P44"] = null;
      featureData.current_phase = "P44";
      await saveFeature(apiKeyId, slug, featureData);

      await appendRunLog(
        apiKeyId,
        slug,
        `## P44 — Human Review: REJECTED\n` +
        `**Timestamp:** ${now()}\n` +
        `**Rejected By:** ${reviewer_name}\n` +
        `**Reason:** ${rejection_reason}\n\n---\n\n`
      );

      return text(
        `Implementation rejected by ${reviewer_name}.\n\n` +
        `Reason: ${rejection_reason}\n\n` +
        `The AI must fix the implementation per this feedback, ` +
        `commit and push the fixes, re-run the implementation gate, ` +
        `then return to the developer for explicit approval.\n\n` +
        `Call get_phase_prompt('${slug}', 'P44') to reload the P44 prompt for revision.`
      );
    }

    // ── create_pr ─────────────────────────────────────────────────────────
    if (toolName === "create_pr") {
      const {
        feature_slug: slug,
        title,
        body,
        base_branch = "main",
        head_branch,
        github_repo_url,
      } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      // Hard gate: implementation must be approved before a PR can be opened
      if (featureData.implementation_approval?.status !== "approved") {
        return text(
          `ERROR: Cannot create PR — P44 implementation has not been approved by a developer.\n\n` +
          `Current approval status: ${featureData.implementation_approval?.status || "none"}\n\n` +
          `Call approve_implementation first. A PR must never be opened from unapproved implementation.`
        );
      }

      const token = featureData.github_token;
      if (!token) {
        return text(
          `ERROR: No GitHub token found in feature state.\n\n` +
          `Provide a github_token when calling start_feature to enable PR creation.\n` +
          `The PAT requires 'pull_requests: write' (fine-grained) or 'repo' scope (classic).`
        );
      }

      // Resolve the repo URL: prefer explicit arg, then target_repo_path, then error
      const repoUrl = github_repo_url || featureData.target_repo_path || null;
      if (!repoUrl || !repoUrl.includes("github.com")) {
        return text(
          `ERROR: Cannot determine GitHub repository URL.\n\n` +
          `Provide github_repo_url explicitly (e.g. https://github.com/owner/repo), ` +
          `or set target_repo_path to the GitHub URL when calling start_feature.`
        );
      }

      const urlMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+)/);
      if (!urlMatch) {
        return text(`ERROR: Cannot parse owner/repo from repository URL: ${repoUrl}`);
      }
      const owner = urlMatch[1];
      const repo = urlMatch[2].replace(/\.git$/, "");

      // Resolve head branch — from argument or from git in target_repo_path
      let headBranch = head_branch;
      if (!headBranch) {
        try {
          const { execSync } = await import("child_process");
          headBranch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: featureData.target_repo_path,
            encoding: "utf-8",
          }).trim();
        } catch (e) {
          return text(
            `ERROR: Could not read current git branch from ${featureData.target_repo_path}: ${e.message}\nProvide head_branch explicitly.`
          );
        }
      }

      if (headBranch === "main" || headBranch === "master") {
        return text(
          `ERROR: head_branch is '${headBranch}' — this is the base branch. ` +
          `The feature must be on a separate branch. Commit and push your changes to a feature branch first.`
        );
      }

      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "AAFM-Pipeline/2.0",
      };

      let prResp;
      try {
        prResp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ title, body, head: headBranch, base: base_branch }),
        });
      } catch (e) {
        return text(`ERROR: Network error calling GitHub API: ${e.message}`);
      }

      if (!prResp.ok) {
        const errBody = await prResp.text();
        let hint = "";
        if (prResp.status === 403) {
          hint =
            `\n\n403 Forbidden — most likely cause: the PAT does not have 'pull_requests: write' permission.\n` +
            `Check your PAT and ensure it has:\n` +
            `  Fine-grained PAT: 'Pull requests' → Read and write\n` +
            `  Classic PAT: 'repo' scope\n\n` +
            `Also check that the branch '${headBranch}' has been pushed to GitHub.`;
        } else if (prResp.status === 422) {
          hint =
            `\n\n422 Unprocessable — common causes:\n` +
            `  • Branch '${headBranch}' has no commits ahead of '${base_branch}' — nothing to merge\n` +
            `  • A PR for this branch already exists\n` +
            `  • Branch '${headBranch}' does not exist on GitHub — push it first: git push origin ${headBranch}`;
        }
        return text(`ERROR: GitHub API returned ${prResp.status} ${prResp.statusText}.\n${errBody}${hint}`);
      }

      const prData = await prResp.json();
      const prUrl = prData.html_url;

      await appendRunLog(
        apiKeyId,
        slug,
        `## PR Created\n**Timestamp:** ${now()}\n**PR URL:** ${prUrl}\n**Branch:** ${headBranch} → ${base_branch}\n\n---\n\n`
      );

      return text(
        `╔══════════════════════════════════════════════════════╗\n` +
        `║  Pull Request Created                                ║\n` +
        `╚══════════════════════════════════════════════════════╝\n\n` +
        `  ✓ PR URL:    ${prUrl}\n` +
        `  ✓ Branch:   ${headBranch} → ${base_branch}\n` +
        `  ✓ Title:    ${title}\n\n` +
        `  ▶ Call complete_feature('${slug}', '${prUrl}') to close the run.\n`
      );
    }

    // ── log_iteration ─────────────────────────────────────────────────────
    if (toolName === "log_iteration") {
      const { feature_slug: slug, phase, attempt_number, what_changed } = args;
      // Load to verify feature exists; we don't need featureData fields here
      await loadFeature(apiKeyId, slug);
      await appendRunLog(
        apiKeyId,
        slug,
        `## ${phase} — Iteration ${attempt_number}\n**Timestamp:** ${now()}\n**What Changed:** ${what_changed}\n\n---\n\n`
      );
      return text(`Iteration ${attempt_number} logged for ${phase}.`);
    }

    // ── advance_phase ─────────────────────────────────────────────────────
    if (toolName === "advance_phase") {
      const { feature_slug: slug } = args;
      const featureData = await loadFeature(apiKeyId, slug);
      const current = featureData.current_phase;

      // Hard stop: P41 passed phase gate but not yet human-approved
      if (
        current === "P41" &&
        featureData.phase_results["P41"] === "PASS" &&
        featureData.human_approval?.status !== "approved"
      ) {
        return text(
          `PIPELINE BLOCKED — Human approval required before P42 can begin.\n\n` +
          `The P41 phase gate has passed, but a developer must review and approve ` +
          `${featureData.plan_file_name || "Plan.md"} before implementation proceeds.\n\n` +
          `To approve: call approve_plan('${slug}', reviewer_name, optional_notes)\n` +
          `To reject:  call reject_plan('${slug}', reviewer_name, rejection_reason)`
        );
      }

      // Validate artifact exists for phases that produce one
      if (current === "P42") {
        const buildContent = await getArtifactBySlug(apiKeyId, slug, "build");
        if (!buildContent) {
          return text(
            `ERROR: Cannot advance — Build artifact not found in Supabase for feature '${slug}'. ` +
            `Save the Build.md content using saveArtifact before advancing.`
          );
        }
      }
      if (current === "P43") {
        const todoContent = await getArtifactBySlug(apiKeyId, slug, "todo");
        if (!todoContent) {
          return text(
            `ERROR: Cannot advance — ToDo artifact not found in Supabase for feature '${slug}'. ` +
            `Save the ToDo.md content using saveArtifact before advancing.`
          );
        }
      }

      // Validate current phase passed (except P41-approved which bypasses this)
      if (current !== "P41-approved" && featureData.phase_results[current] !== "PASS") {
        return text(
          `ERROR: Cannot advance — ${current} gate has not PASSED. ` +
          `Current result: ${featureData.phase_results[current]}`
        );
      }

      const nextPhaseMap = {
        "pre-flight": "P41",
        "P41-approved": "P42",
        P42: "P43",
        P43: "P44",
        P44: "complete",
      };
      const nextPhase = nextPhaseMap[current];
      if (!nextPhase || nextPhase === current) return text("Cannot determine next phase.");
      if (nextPhase === "complete") return text("Feature is at P44. Call complete_feature when done.");

      featureData.current_phase = nextPhase;
      await saveFeature(apiKeyId, slug, featureData);
      await appendRunLog(apiKeyId, slug, `## Advanced to ${nextPhase}\n**Timestamp:** ${now()}\n\n---\n\n`);

      return text(
        `Advanced to ${nextPhase}. Immediately call get_phase_prompt('${slug}', '${nextPhase}') ` +
        `and begin the next phase — do not pause or ask the developer.`
      );
    }

    // ── get_run_status ────────────────────────────────────────────────────
    if (toolName === "get_run_status") {
      const { feature_slug: slug } = args;
      const featureData = await loadFeature(apiKeyId, slug);
      const elapsed = elapsedMinutes(featureData.started_at);
      const { phase_attempts: att, phase_results: res, human_approval: ha } = featureData;

      let status =
        `────────────────────────────────\n` +
        `Feature:        ${featureData.feature_name}\n` +
        `Slug:           ${slug}\n` +
        `Plan File:      ${featureData.plan_file_name || "Plan.md"}\n` +
        `Current Phase:  ${featureData.current_phase}\n` +
        `Status:         ${featureData.status}\n` +
        `Started:        ${featureData.started_at}\n` +
        `Elapsed:        ${elapsed} min\n\n` +
        `Phase Results:\n`;

      for (const phase of ["pre-flight", "P41", "P42", "P43", "P44"]) {
        status += `  ${phase}: ${res[phase] || "not started"} (${att[phase] || 0} attempt(s))\n`;
      }

      status += `\nHuman Gate 1 (Plan Approval):\n`;
      status += `  Status:      ${ha?.status || "pending"}\n`;
      if (ha?.approved_by) status += `  Approved by: ${ha.approved_by} at ${ha.approved_at}\n`;
      if (ha?.review_notes) status += `  Notes:       ${ha.review_notes}\n`;

      const ia = featureData.implementation_approval;
      status += `\nHuman Gate 2 (Implementation Approval):\n`;
      status += `  Status:      ${ia?.status || "pending"}\n`;
      if (ia?.approved_by) status += `  Approved by: ${ia.approved_by} at ${ia.approved_at}\n`;
      if (ia?.review_notes) status += `  Notes:       ${ia.review_notes}\n`;

      return text(status);
    }

    // ── complete_feature ──────────────────────────────────────────────────
    if (toolName === "complete_feature") {
      const { feature_slug: slug, pr_url } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      // Hard gate: P44 must have been human-approved before feature can complete
      if (featureData.implementation_approval?.status !== "approved") {
        return text(
          `ERROR: Cannot complete — P44 implementation has not been approved by a developer.\n\n` +
          `Current approval status: ${featureData.implementation_approval?.status || "none"}\n\n` +
          `The P44 phase gate must pass and a developer must call approve_implementation before\n` +
          `the feature can be marked complete. Gate 2 cannot be bypassed.`
        );
      }

      // Validate lessons-learned artifact exists
      const lessonsContent = await getArtifactBySlug(apiKeyId, slug, "lessons_learned");
      if (!lessonsContent) {
        return text(
          `ERROR: Cannot complete — Lessons-Learned artifact not found in Supabase for feature '${slug}'.\n\n` +
          `Save the Lessons-Learned.md content as an artifact before completing the feature.\n` +
          `The P44 prompt contains the required template and sections.`
        );
      }

      featureData.status = "complete";
      featureData.completed_at = now();
      featureData.pr_url = pr_url;
      await saveFeature(apiKeyId, slug, featureData);

      const totalMin = elapsedMinutes(featureData.started_at);
      const att = featureData.phase_attempts;
      const totalAttempts = Object.values(att).reduce((a, b) => a + b, 0);

      let summary = `## Summary\n| Phase | Attempts |\n|-------|----------|\n`;
      for (const phase of ["pre-flight", "P41", "P42", "P43", "P44"]) {
        summary += `| ${phase} | ${att[phase] || 0} |\n`;
      }
      summary +=
        `| **Total** | **${totalAttempts}** |\n\n` +
        `**Human Approved By:** ${featureData.human_approval?.approved_by || "N/A"}\n` +
        `**PR:** ${pr_url}\n**Total Duration:** ${totalMin} min\n` +
        `**Outcome:** SUCCESS\n`;
      await appendRunLog(apiKeyId, slug, summary);

      // Attempt to push run log to GitHub if token and repo URL are available
      const token = featureData.github_token;
      let ghMessage = "GitHub log push skipped (no github_token in feature state).";
      if (token) {
        const repoUrl = featureData.target_repo_path || "";
        if (repoUrl.includes("github.com")) {
          const runLogContent = await getRunLog(apiKeyId, slug);
          const ghResult = await pushToGitHub(token, repoUrl, "Feature-Run-Log.md", runLogContent);
          ghMessage = ghResult.ok
            ? `Run log pushed to GitHub: ${ghResult.url}`
            : `GitHub push skipped or failed (log is safe in Supabase): ${ghResult.reason}\n  To push manually later, call push_run_log('${slug}').`;
        } else {
          ghMessage = "GitHub push skipped — target_repo_path is not a GitHub URL. Call push_run_log with a github_repo_url to push manually.";
        }
      }

      return text(
        `Feature '${featureData.feature_name}' completed in ${totalMin} min.\n` +
        `PR: ${pr_url}\n\n` +
        `${ghMessage}`
      );
    }

    // ── get_run_log ───────────────────────────────────────────────────────
    if (toolName === "get_run_log") {
      const { feature_slug: slug } = args;
      const logContent = await getRunLog(apiKeyId, slug);
      if (!logContent) return text(`No run log found for '${slug}'.`);
      return text(logContent);
    }

    // ── push_run_log ──────────────────────────────────────────────────────
    if (toolName === "push_run_log") {
      const {
        feature_slug: slug,
        github_repo_url,
        github_log_filename = "Feature-Run-Log.md",
      } = args;
      const featureData = await loadFeature(apiKeyId, slug);

      const token = featureData.github_token;
      if (!token) {
        return text(
          `ERROR: No GitHub token found in feature state for '${slug}'.\n\n` +
          `Provide a github_token when calling start_feature to enable log pushing.`
        );
      }

      const repoUrl = github_repo_url || featureData.target_repo_path || "";
      if (!repoUrl || !repoUrl.includes("github.com")) {
        return text(
          `ERROR: Cannot determine GitHub repository URL.\n\n` +
          `Provide github_repo_url explicitly (e.g. https://github.com/owner/repo).`
        );
      }

      const runLogContent = await getRunLog(apiKeyId, slug);
      if (!runLogContent) {
        return text(`ERROR: No run log found for '${slug}'. Complete at least one feature run first.`);
      }

      const ghResult = await pushToGitHub(token, repoUrl, github_log_filename, runLogContent);
      if (ghResult.ok) {
        return text(`Run log pushed to GitHub: ${ghResult.url}`);
      } else {
        return text(
          `Push failed: ${ghResult.reason}\n\nCheck that:\n` +
          `- github_token has the required GitHub permissions\n` +
          `- github_repo_url points to a valid GitHub repository\n` +
          `- github_log_filename is a valid path within the repo`
        );
      }
    }

    return text(`Unknown tool: ${toolName}`);
  } catch (err) {
    return text(`ERROR: ${err.message}`);
  }
}
