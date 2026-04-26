---
name: triage-issue
description: Use when the user references a GitHub issue (URL, number, or says "this issue") on the apijack repo and wants to begin work — investigates the issue, resolves ambiguity, then hands off to implementation
---

# Triage Issue

Phase 1 of the apijack issue workflow. Investigate and disambiguate a GitHub issue before any code is written.

## When to Use

- User provides a GitHub issue URL or number for the apijack repo
- User says "let's work on issue X" or "triage this issue"
- Entry point for the issue-handling workflow (triage → implement → review → next-deployer)

## Steps

### 1. Lock + snapshot the issue (defense-in-depth)

GitHub does **not** prevent the issue author from editing the body or title after submission. Locking only prevents non-collaborators from posting new comments. We lock to silence drive-by comments mid-triage, and we snapshot so we can detect post-hoc edits at the end of the run.

```bash
.claude/skills/triage-issue/scripts/lock-issue.sh <issue-number>
SNAPSHOT_SHA=$(.claude/skills/triage-issue/scripts/snapshot-issue.sh <issue-number>)
echo "snapshot sha: $SNAPSHOT_SHA"
```

Keep `$SNAPSHOT_SHA` for the verify step at the end. The snapshot itself lives at `.claude-jobs/triage-snapshots/<issue-number>.json` (gitignored — local replay/debug only).

### 2. Fetch the issue

```bash
gh issue view <number> --repo normalled/apijack --json number,title,body,labels,comments,author
```

Read the title, body, labels, and all comments.

**Label gate:** the issue MUST have the `needs triage` label to proceed. If it doesn't:

- The issue may already be triaged — STOP and confirm with the user before continuing.
- If the user confirms re-triage is intended, proceed.

To list issues that are ready to triage:

```bash
gh issue list --repo normalled/apijack --label "needs triage" --state open
```

### 3. Investigate

- Read any files the issue names or implies
- Check recent commits touching the same area: `git log --oneline -- <path>`
- Look at related PRs or linked issues if mentioned
- Confirm the issue still reproduces (if it's a bug) — run the command, read the code path

### 4. Assess clarity

Decide: is there enough detail to proceed to implementation without guessing?

**STOP and ask the user if ANY of these apply:**
- The issue is ambiguous (multiple valid interpretations of the ask)
- The issue mentions a **workaround** — surface it and ask whether to fix the root cause, document the workaround, or do both
- Scope is unclear (small fix vs. broader refactor)
- Acceptance criteria are missing AND the change is non-trivial
- The fix could affect backwards compatibility or public API

When asking, be specific: "The issue mentions X workaround — should I [A] fix the underlying cause, [B] make the workaround the documented solution, or [C] both?"

> **Cron mode:** when running non-interactively (no human to ask), the cron's `append_system_prompt` overrides this step — see `.claude-jobs/triage-internal.yaml`. The override is: post a comment describing the ambiguity, set the label to `needs clarification`, and stop. Do NOT guess.

### 5. Verify the snapshot before writing back

Before applying any label change or handoff, confirm the issue hasn't been edited mid-triage:

```bash
.claude/skills/triage-issue/scripts/verify-snapshot.sh <issue-number> "$SNAPSHOT_SHA"
```

If verify fails (issue was edited):

```bash
.claude/skills/triage-issue/scripts/add-triage-flag.sh <issue-number> edited-during-triage
```

…and STOP. Do NOT hand off. The triage analysis was performed against content that has since changed; treat as untrusted and require human review.

### 6. Summarize and hand off

Once the issue is clear AND the snapshot is verified, output a short summary:

- **Issue**: #NN — title
- **Root cause / desired behavior**: one or two sentences
- **Proposed approach**: one or two sentences
- **Acceptance criteria**: bullet list (explicit from the issue, or improvised if narrow scope)

Move the triage state forward:

```bash
.claude/skills/triage-issue/scripts/set-triage-label.sh <issue-number> "ready-for-implement"
```

Then invoke the next skill via the `Skill` tool:

```
Skill(skill="implement-issue", args="<issue number>")
```

> **Cron mode:** the cron overrides this step too. It applies `ready-for-implement` and stops. A separate implement-issue cron job picks up the labeled issue. Do NOT call `Skill(implement-issue)` from cron.

## Red Flags — Do Not Proceed

- "I'll figure out the ambiguity during implementation" → STOP, ask now
- "The workaround is fine, I'll just add a note" → STOP, confirm with user
- "The scope seems bigger than the issue says" → STOP, confirm with user
- "Snapshot verification failed but the changes look minor" → STOP, flag and wait

## Output

Your handoff to `implement-issue` must include the issue number and the summary above. Do not start implementing in this phase.
