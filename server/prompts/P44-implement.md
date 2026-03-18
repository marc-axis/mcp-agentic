# P44 — Implementation

**Feature:** {{FEATURE_NAME}}

---

⚠ **IMPORTANT — Read before proceeding:**
This prompt was returned by the MCP tool `get_phase_prompt`. You are now executing P44.
- Do NOT simulate, predict, or narrate what you would do — execute each step for real
- Do NOT call any MCP tool until you have completed the step that precedes it
- Do NOT mark any task complete until its verification has actually been run and passed
- If you are unsure whether a previous tool call actually executed, check `get_run_status` before continuing

---

## Your Task

Implement the feature by working through ToDo.md task by task.

## Before You Begin — Branch Check

Before writing a single line of code, verify you are on a feature branch:

```
git status
```

- If the current branch is `main` or `master` — **stop immediately**. Do not implement anything. Tell the developer:
  > "Implementation cannot begin on main/master. Please create a feature branch and switch to it:
  > `git checkout -b feature/[branch-name]`
  > Then reply to continue."
  Wait for confirmation before proceeding.
- If the current branch is a feature branch — continue.

## Governing Rules

These rules apply throughout this phase and cannot be overridden. Full governance is defined in `MCP-AI-Rules.md` in the AAFM root.

- **Facts only** — implement only what is specified in ToDo.md, Build.md, and Plan.md. Do not add unrequested functionality or infer hidden behaviour from the codebase.
- **No hidden assumptions** — if any task is ambiguous or the existing code behaves unexpectedly, do not guess. Stop and ask the user for clarification before proceeding.
- **All generated code must be validated** — every task must pass its stated verification before being marked complete. Do not mark a task complete without running its verification.
- **If uncertain, stop and ask** — do not proceed past a point of genuine uncertainty. Raise it to the user and wait for an answer.
- **Never self-approve** — do not call `approve_implementation` autonomously. Only proceed to PR creation after the developer explicitly types "Call approve_implementation" and types their name.
- **Never use a placeholder PR URL** — `complete_feature` must always be called with a real GitHub PR URL.

## Rules

- Work through tasks **in order** — do not skip ahead
- **Mark each task complete** in ToDo.md as you finish it: change `- [ ]` to `- [x]`
- **Run the verification** for each task before marking it complete
- If a task fails its verification, fix it before moving on
- Do not modify Plan.md or Build.md — they are reference documents only
- **Documentation and context file updates require explicit developer confirmation** — before writing to any repo docs, architecture files, READMEs, or context files, present the full list of proposed updates to the developer and ask: "Do you want me to update the repo context and documentation files? (Yes / No)" — proceed only on explicit Yes. If the developer says No, skip all documentation tasks and proceed to Lessons-Learned.md and the gate. The developer's decision must be respected without argument.
- **Documentation and context file updates are the final tasks** — do not update any repo docs, architecture files, READMEs, or context files until all implementation tasks, all automated tests, and all manual verification tasks have passed. If implementation fails, documentation must not be touched.
- **Windows / PowerShell — multi-line git arguments:** PowerShell does not support bash heredoc syntax (`<<EOF`). For multi-line commit messages or PR bodies, write the content to a temp file first and reference it: `git commit -F tmpfile.txt` or pass the message as a single quoted string. Do not use `<<EOF` or `@'...'@` heredoc blocks in git commands on Windows.

## After All Tasks Are Complete

Run the full verification suite:

1. **Build**: Run the project build command — must exit 0
2. **Tests**: Run the full test suite — all must pass
3. **Lint**: Run the linter — must pass with no errors
4. **Type check**: Run the type checker if applicable — must pass

---

## Gate: Implementation Validation

Evaluate implementation against every criterion below. Produce the gate result yourself — do not wait for a human to invoke a skill.

| Criterion | Status | Notes |
|-----------|--------|-------|
| All ToDo items marked complete (`- [x]`) | ✓ / ✗ | |
| Tests pass — full test suite exit 0 | ✓ / ✗ | |
| Build succeeds — build command exit 0 | ✓ / ✗ | |
| Linting passes — no errors | ✓ / ✗ | |
| Type checking passes (if applicable) | ✓ / ✗ | |
| Manual verification steps completed and noted | ✓ / ✗ | |
| All success criteria from Plan.md and Build.md met | ✓ / ✗ | |
| Documentation updated only after all tests and manual verification passed — not before | ✓ / ✗ | |
| Context/doc updates confirmed by developer (Yes / No) before any doc file was written | ✓ / ✗ | |
| Lessons learned documented (see below) | ✓ / ✗ | |

If any criterion fails, fix the specific failures, re-run verification, and re-evaluate. Repeat until all criteria pass.

---

## Create Lessons-Learned.md

Before recording the gate result, create `Lessons-Learned.md` at this exact path:

```
{{FEATURE_FOLDER_PATH}}\Lessons-Learned.md
```

```markdown
# Lessons Learned: {{FEATURE_NAME}}

**Date:** [today's date]
**Feature Folder:** {{FEATURE_SLUG}}

## What Went Well
[List anything that worked smoothly — patterns that held, estimations that were accurate, tools that helped.]

## What Was Harder Than Expected
[List anything that took longer, required rework, or had unexpected complexity.]

## Gate Iterations
[Note how many attempts each phase gate required and why any failed.]

## Follow-Up Actions
[Any technical debt, deferred improvements, or items to revisit. If none, write "None".]

## Recommendations for Future Features
[Any process, tooling, or planning improvements that would help the next feature run.]
```

Fill in all sections. Do not leave placeholders — if a section has nothing to report, write "None."

---

## After Gate PASS

Call the following MCP tools in order:

**Step 1 — Record the gate result:**
```
record_gate_result(
  feature_slug: "{{FEATURE_SLUG}}",
  phase: "P44",
  result: "PASS",
  criteria_table: "[paste the completed criteria table above]",
  feedback: ""
)
```

**Step 2 — Pause for Gate 2:**

The server will return a Gate 2 panel. Present it to the developer exactly as displayed — do not rephrase or summarise it. The panel instructs the developer to type 'Call approve_implementation' or 'Call reject_implementation'. Wait for that explicit instruction. Do not proceed until `approve_implementation` has been called by the developer in this session. Do not infer or pre-fill `reviewer_name`.

**Step 3 — After approve_implementation is called:**

The server will return a Gate 2 cleared panel with PR instructions. Follow them exactly:

- Ask the developer: "Do you want me to create a Pull Request now? (yes / no)"
- **If yes:** Call `create_pr(feature_slug: "{{FEATURE_SLUG}}")` — omit `head_branch`. The server reads the current branch from git. If `create_pr` succeeds, it returns a real PR URL — call `complete_feature` with it immediately, no further input needed from the developer.
- **If create_pr fails** (token permissions, branch not pushed, etc.): Tell the developer exactly what failed, then ask as a separate message: "Please provide the PR URL:" — wait for the reply. Once you receive a URL starting with `https://github.com/`, call `complete_feature` with it immediately. Do not ask the developer to type "Call complete_feature" — receiving the URL is the trigger.
- **If no:** Ask as a separate message: "Please provide the PR URL when you are ready:" — wait for the reply. Once you receive a URL starting with `https://github.com/`, call `complete_feature` with it immediately. Do not ask the developer to type "Call complete_feature".

**Never use a placeholder URL. Never call complete_feature without a real PR URL.**
