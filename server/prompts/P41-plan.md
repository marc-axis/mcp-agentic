# P41 — Implementation Plan (Convergent Deduction)

**Feature:** {{FEATURE_NAME}}
**Plan File:** {{PLAN_FILE_NAME}}
**Convergence Runs:** {{CONVERGENCE_RUNS}}

---

⚠ **IMPORTANT — Read before proceeding:**
This prompt was returned by the MCP tool `start_feature`. You are now executing P41.
- Do NOT simulate, predict, or narrate what you would do — execute each step for real
- Do NOT call any MCP tool until you have completed the step that precedes it
- Do NOT proceed to the next step until the current step is fully done
- If you are unsure whether a previous tool call actually executed, check `get_run_status` before continuing

---

## User Story

{{USER_STORY}}

---

## Target Repository

`{{TARGET_REPO_PATH}}`

---

## Feature Overview

{{FEATURE_OVERVIEW}}

## Repositories Affected

{{REPOSITORIES_AFFECTED}}

## Support Documentation

{{SUPPORT_DOCUMENTATION}}

## Feature Constraints

{{FEATURE_CONSTRAINTS}}

## Traceability References

{{TRACEABILITY_REFS}}

---

## Governing Rules

These rules apply throughout this phase and cannot be overridden. Full governance is defined in `MCP-AI-Rules.md` in the AAFM root.

- **Facts only** — every decision must be grounded in what you have actually read in the repository. Do not assume functionality, infer hidden code, or carry forward assumptions from a previous session. If you have not read it, read it now.
- **No hidden assumptions** — if something is unclear from the repository or user story, do not guess. State the uncertainty explicitly and ask the user for clarification before proceeding.
- **If uncertain, stop and ask** — do not proceed past a point of genuine uncertainty. Raise it to the user and wait for an answer.
- **Clarification is not approval** — if the developer provides a clarification that changes any aspect of Plan.md, you must: (1) apply the clarification and re-save Plan.md, (2) re-run the plan-file-review gate, (3) notify the developer to review the updated plan, (4) wait for an explicit `approve_plan` call. A clarification answer in chat never constitutes approval. Gate 1 must be fully re-instated after any change to Plan.md.
- **Never self-approve** — do not call `approve_plan` autonomously. Do not treat any conversational exchange as implicit approval. Only proceed to P42 after the developer explicitly types "Call approve_plan".

---

## STEP 1 — Read the Target Repository

Before generating any plan, read the target repository at `{{TARGET_REPO_PATH}}`. At minimum read:

- Root folder structure
- `package.json` / `requirements.txt` / equivalent — tech stack, dependencies, scripts
- `README.md` if present — architecture and conventions overview
- 2–3 representative source files — to understand patterns and coding style
- Test folder and one existing test file — test framework and conventions

Do not proceed until you have read the repository. Every plan you generate must be grounded in what you actually found — not assumed conventions.

---

## STEP 2 — Convergent Deduction

You will generate **{{CONVERGENCE_RUNS}} independent implementation plan(s)**.

### Rules for each plan
- Each plan must be generated **independently** — do not reference or build on previous plans
- Each plan must be **fully grounded** in the user story and what you read in the repository
- Each plan must cover all 8 sections below
- Treat each plan as if it were the only plan you are writing

### The 8 sections every plan must cover

**1. Overview**
One sentence. What is being built and why. Traceable to the user story.

**2. Technical Approach**
How it will be built. Which patterns, conventions, and existing code it builds on. Grounded in what you found in the repository.

**3. Files Affected**
Every file that will be created or modified. Full paths from repository root. Mark each CREATE or MODIFY.

**4. Dependencies**
Every dependency this feature uses. State whether it exists in the package config (which you have read) or is new. If new, state the install command.

**5. Assumptions**
Every assumption made. Each explicitly stated. No hidden assumptions.

**6. Test Strategy**
How the feature will be tested. Reference the actual test framework and file conventions found in the repository.

**7. Success Criteria**
Specific, measurable conditions that define done. If Ref numbers were provided, each Ref must have a corresponding criterion.

**8. Rollback Strategy**
How to disable or revert the feature. Grounded in the actual branching or rollback approach used in the repository.

---

### Generate the plans now

Generate each plan in full, clearly labelled:

```
## Plan 1 of {{CONVERGENCE_RUNS}}
[full 8-section plan]

## Plan 2 of {{CONVERGENCE_RUNS}}
[full 8-section plan]

...
```

---

## STEP 3 — Convergence Analysis

*Skip this step entirely if {{CONVERGENCE_RUNS}} = 1. Proceed directly to Step 4.*

Compare all {{CONVERGENCE_RUNS}} plans across the following dimensions. For each dimension, assess whether the plans agree, partially agree, or diverge:

| Dimension | Agreement | Notes |
|-----------|-----------|-------|
| Files affected — same files touched? | Agree / Partial / Diverge | |
| Technical approach — same pattern / solution shape? | Agree / Partial / Diverge | |
| Dependencies — same packages? | Agree / Partial / Diverge | |
| Success criteria — same definition of done? | Agree / Partial / Diverge | |
| Test strategy — same approach? | Agree / Partial / Diverge | |
| Rollback strategy — same mechanism? | Agree / Partial / Diverge | |

### Confidence Score

Based on the comparison above, assign a confidence level:

| Result | Confidence | Meaning |
|--------|-----------|---------|
| All dimensions: Agree | HIGH | Story is clear, repo is well-understood, solution is obvious |
| 1–2 dimensions: Partial | MEDIUM | Minor ambiguity — flagged but not blocking |
| 3+ dimensions: Diverge | LOW | Story has multiple valid solutions or repo context is insufficient |

### Divergence Points

List every dimension where plans disagreed and exactly what differed:

```
## Divergence Points
- [Dimension]: [What Plan X proposed vs what Plan Y proposed]
- ...
```

---

## STEP 4 — Select the Consensus Plan

If {{CONVERGENCE_RUNS}} = 1: the single plan is the consensus plan.

If {{CONVERGENCE_RUNS}} ≥ 2: select the plan that best represents the consensus across all dimensions — the one whose approach, files, and dependencies are most consistent with the majority of plans. Where plans diverged, use the majority position. State which plan was selected as the basis and why.

Produce the final consensus plan as a clean, standalone document — this becomes `{{PLAN_FILE_NAME}}`.

---

## STEP 5 — Confidence Report

*Skip if {{CONVERGENCE_RUNS}} = 1.*

Produce a Confidence Report to present to the developer:

```
## Convergence Confidence Report
**Feature:** {{FEATURE_NAME}}
**Plans Generated:** {{CONVERGENCE_RUNS}}
**Confidence:** [HIGH | MEDIUM | LOW]

### Agreement Summary
[Paste the completed comparison table from Step 3]

### Divergence Points
[Paste divergence points, or "None — all plans converged"]

### Basis Plan Selected
Plan [N] — [one sentence on why this was the most convergent]

### Developer Note
[HIGH]:   All plans agreed. High confidence this is the correct solution.
[MEDIUM]: Minor divergence noted above. Review flagged points before approving.
[LOW]:    Significant divergence. Consider refining the user story or providing
          additional repo context before proceeding.
```

---

## STEP 6 — Save Plan.md

Save the consensus plan as `{{PLAN_FILE_NAME}}` to this exact path:

```
{{FEATURE_FOLDER_PATH}}\{{PLAN_FILE_NAME}}
```

---

## Gate: Plan File Review

Evaluate `{{PLAN_FILE_NAME}}` against every criterion below. Produce the gate result yourself.

| Criterion | Status | Notes |
|-----------|--------|-------|
| Traceability — every deliverable traces to the user story | ✓ / ✗ | |
| Assumptions — no hidden assumptions; all stated explicitly | ✓ / ✗ | |
| File references — all referenced files exist or are marked "to be created" | ✓ / ✗ | |
| Patterns — referenced patterns point to actual code in the repository | ✓ / ✗ | |
| Conventions — technical approach matches what was found in the repository | ✓ / ✗ | |
| Dependencies — verified against actual package config or marked as new | ✓ / ✗ | |
| Test strategy — aligns with actual test patterns found in the repository | ✓ / ✗ | |
| Rollback — rollback or feature-disable strategy is stated | ✓ / ✗ | |

If any criterion fails, revise `{{PLAN_FILE_NAME}}` and re-evaluate. Repeat until all criteria pass.

---

## After Gate PASS

Call the following MCP tools in order:

**Step 1 — Record the gate result:**
```
record_gate_result(
  feature_slug: "{{FEATURE_SLUG}}",
  phase: "P41",
  result: "PASS",
  criteria_table: "[paste the completed criteria table above]",
  feedback: ""
)
```

**Step 2 — Advance phase:**
```
advance_phase(feature_slug: "{{FEATURE_SLUG}}")
```

The server will pause the pipeline and return a Gate 1 panel. Present it to the developer exactly as displayed — do not rephrase or summarise it. The panel instructs the developer to type 'Call approve_plan' or 'Call reject_plan'. Wait for that explicit instruction — do not proceed to P42 until `approve_plan` has been called by the developer in this session. Do not infer or pre-fill `reviewer_name`.
