# P43 — Task List

**Feature:** {{FEATURE_NAME}}

---

⚠ **IMPORTANT — Read before proceeding:**
This prompt was returned by the MCP tool `get_phase_prompt`. You are now executing P43.
- Do NOT simulate, predict, or narrate what you would do — execute each step for real
- Do NOT call any MCP tool until you have completed the step that precedes it
- Do NOT proceed to the next step until the current step is fully done
- If you are unsure whether a previous tool call actually executed, check `get_run_status` before continuing

---

## Your Task

Break the Build Guide (Build.md) into a granular ToDo.md task list.

## Governing Rules

These rules apply throughout this phase and cannot be overridden. Full governance is defined in `MCP-AI-Rules.md` in the AAFM root.

- **Facts only** — every task must be traceable to a specific item in Build.md. Do not add tasks based on assumption or general best practice not stated in Build.md.
- **No hidden assumptions** — if Build.md is ambiguous on any point, do not guess. State the uncertainty and ask the user for clarification before proceeding.
- **All generated tasks must be verifiable** — every task must have a concrete verification method.
- **If uncertain, stop and ask** — do not proceed past a point of genuine uncertainty. Raise it to the user and wait for an answer.

## Rules

- **Every item in Build.md** must be covered by one or more tasks — nothing may be omitted
- **Each task must be completable in under 30 minutes** — split anything larger
- **Each task must have a verification method** — how will you know it is done? (run a test, run a command, check a file, observe a behaviour)
- **Tasks must be dependency-ordered** — no task can depend on work not yet done above it
- **Each phase must follow build → test → verify** where applicable
- All file paths must be **exact**
- All commands must be **complete and runnable as written**
- **Documentation and context file updates are ALWAYS the final tasks** — they must appear after all implementation tasks, all automated tests, and all manual verification tasks. They must never be interleaved with code changes. A documentation task must never execute if any earlier task has not passed its verification.

## Task Ordering — Mandatory Structure

The task list must follow this exact top-to-bottom order:

1. **Implementation tasks** — all code changes
2. **Automated test tasks** — run and pass all automated tests
3. **Manual verification tasks** — steps the developer must perform and confirm
4. **Documentation / context file update tasks** — update repo docs, architecture files, READMEs, etc.

Documentation tasks must never appear before all implementation, automated test, and manual verification tasks are complete and verified. If any earlier task fails, documentation tasks must not be started.

## Task Format

```
- [ ] [Task description]
  - File: [exact file path]
  - Action: [what to do]
  - Verify: [how to confirm it is done]
```

## Output

Save your output as `ToDo.md` to this exact path:

```
{{FEATURE_FOLDER_PATH}}\ToDo.md
```

---

## Gate: ToDo File Review

Once `ToDo.md` is saved, evaluate it against every criterion below. Produce the gate result yourself — do not wait for a human to invoke a skill.

| Criterion | Status | Notes |
|-----------|--------|-------|
| Coverage — every Build.md item has one or more corresponding tasks | ✓ / ✗ | |
| Size — each task is completable in under 30 minutes | ✓ / ✗ | |
| Verification — each task has a clear verification method (run test, run command, check file) | ✓ / ✗ | |
| Order — tasks are dependency-ordered (no "test X" before "implement X") | ✓ / ✗ | |
| Build–test–verify — phases follow build → test → verify where applicable | ✓ / ✗ | |
| Docs last — all documentation and context file updates appear after all implementation, automated test, and manual verification tasks | ✓ / ✗ | |
| Paths — all file paths are exact | ✓ / ✗ | |
| Commands — all commands are complete and runnable as written | ✓ / ✗ | |

If any criterion fails, revise `ToDo.md` to address it and re-evaluate. Repeat until all criteria pass.

---

## After Gate PASS

**Step 1 — Record the gate result:**
```
record_gate_result(
  feature_slug: "{{FEATURE_SLUG}}",
  phase: "P43",
  result: "PASS",
  criteria_table: "[paste the completed criteria table above]",
  feedback: ""
)
```

**Step 2 — Advance phase:**
```
advance_phase(feature_slug: "{{FEATURE_SLUG}}")
```

The server will return instructions to call `get_phase_prompt` for P44 and begin immediately. Follow those instructions — do not pause.
