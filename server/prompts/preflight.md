# User Story Analysis — Pre-Flight Check

**Source:** {{USER_STORY_PATH}}

---

## Governing Rules

These rules apply throughout this analysis and cannot be overridden:

- **Facts only** — base every finding strictly on what is written in the user story. Do not infer intent, assume background context, or fill gaps with general knowledge.
- **No hidden assumptions** — if something is ambiguous or missing, flag it explicitly. Do not work around it silently.
- **If uncertain, say so** — uncertainty is a valid and valuable output here. The developer needs to know what is unclear before planning begins.

---

## User Story

{{USER_STORY}}

---

## Your Task

This is an OPTIONAL Step 0 analysis. No feature has been created. Your job is to give the
developer an honest assessment of this user story's quality before they commit to planning.

Analyse the user story against the five questions below:

1. **Is the requirement clear?** Can you describe exactly what needs to be built without making assumptions?
2. **Is the scope defined?** Is it clear where the feature starts and ends?
3. **Are success criteria present?** Is there a measurable way to know when this feature is done?
4. **Is this a single feature?** Or does it contain multiple independent features that should be separate?
5. **Are there hidden assumptions?** Anything that needs clarification before work begins?

---

## Output

Produce a Pre-Flight Report in this format:

```
## Pre-Flight Report

### Verdict: [CLEAR | NEEDS CLARIFICATION | TOO BROAD | SPLIT REQUIRED]

### Analysis
[Your honest assessment against each of the five questions above.
Be specific — quote the parts of the story that are strong or weak.]

### Divergence Risk
[Based on this story alone, how likely is Convergent Deduction to produce
scattered plans? What is the source of potential ambiguity?]
- LOW risk — story is precise, one obvious solution
- MEDIUM risk — some ambiguity, plans may vary on approach
- HIGH risk — vague or broad, plans likely to diverge significantly

### Issues Found (if any)
[List specific problems — quote the exact phrase that is unclear or missing.]

### Recommended Action
- CLEAR:               Story is ready. Proceed to start_feature.
- NEEDS CLARIFICATION: Refine these specific points: [list]. Then re-run check_user_story.
- TOO BROAD:           Story must be narrowed. Suggested scope: [your suggestion].
- SPLIT REQUIRED:      Story contains multiple features. Suggested split: [list sub-features].
```

---

## After Reading the Report

This analysis is for the developer's judgement only. No action is taken automatically.

- If verdict is CLEAR or you are satisfied: call `start_feature` to begin the pipeline
- If verdict is NEEDS CLARIFICATION or TOO BROAD: refine the user story file and call `check_user_story` again
- If verdict is SPLIT REQUIRED: create separate story files for each sub-feature and run each independently
