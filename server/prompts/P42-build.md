# P42 — Build Guide

**Feature:** {{FEATURE_NAME}}

---

⚠ **IMPORTANT — Read before proceeding:**
This prompt was returned by the MCP tool `get_phase_prompt`. You are now executing P42.
- Do NOT simulate, predict, or narrate what you would do — execute each step for real
- Do NOT call any MCP tool until you have completed the step that precedes it
- Do NOT proceed to the next step until the current step is fully done
- If you are unsure whether a previous tool call actually executed, check `get_run_status` before continuing

---

## Your Task

Extract a standalone Build Guide (Build.md) from the Plan.md provided below.

Build.md is a pure implementation guide — instructions only, no rationale or context. A developer (or AI agent) must be able to implement the feature entirely from Build.md without referring back to Plan.md.

## Governing Rules

These rules apply throughout this phase and cannot be overridden. Full governance is defined in `MCP-AI-Rules.md` in the AAFM root.

- **Facts only** — every instruction in Build.md must be grounded in what was established in Plan.md and the actual repository. Do not introduce new approaches, infer hidden functionality, or add steps not traceable to Plan.md.
- **No hidden assumptions** — if Plan.md is ambiguous on any point, do not guess. State the uncertainty and ask the user for clarification before proceeding.
- **All generated instructions must be verifiable** — every step must have a concrete way to confirm it worked.
- **If uncertain, stop and ask** — do not proceed past a point of genuine uncertainty. Raise it to the user and wait for an answer.

## Rules

- Extract **every actionable item** from Plan.md — nothing may be omitted
- **No context or rationale** — that stays in Plan.md. Build.md is instructions only
- All file paths must be **specific and complete**
- All data structures, schemas, and API contracts must be **fully specified** — no "e.g." or vague descriptions
- All integration points must state **exact changes** at exact call sites
- All verification commands must be **copy-pasteable and executable**
- Build.md must be **standalone** — implementable without opening Plan.md

## Output

Save your output as `Build.md` to this exact path:

```
{{FEATURE_FOLDER_PATH}}\Build.md
```

---

## Gate: Build File Review

Once `Build.md` is saved, evaluate it against every criterion below. Produce the gate result yourself — do not wait for a human to invoke a skill.

| Criterion | Status | Notes |
|-----------|--------|-------|
| Completeness — every actionable Plan item appears in Build.md | ✓ / ✗ | |
| File paths — specific and complete, no vague references | ✓ / ✗ | |
| Schemas — exact structures for all data, API, and config items | ✓ / ✗ | |
| Integration points — exact changes stated at exact call sites | ✓ / ✗ | |
| Verification commands — executable and copy-pasteable as written | ✓ / ✗ | |
| No rationale in Build — context and why kept in Plan.md only | ✓ / ✗ | |
| Standalone — implementable without opening Plan.md | ✓ / ✗ | |

If any criterion fails, revise `Build.md` to address it and re-evaluate. Repeat until all criteria pass.

---

## After Gate PASS

**Step 1 — Record the gate result:**
```
record_gate_result(
  feature_slug: "{{FEATURE_SLUG}}",
  phase: "P42",
  result: "PASS",
  criteria_table: "[paste the completed criteria table above]",
  feedback: ""
)
```

**Step 2 — Advance phase:**
```
advance_phase(feature_slug: "{{FEATURE_SLUG}}")
```

The server will return instructions to call `get_phase_prompt` for P43 and begin immediately. Follow those instructions — do not pause.
