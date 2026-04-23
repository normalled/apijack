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

### 1. Fetch the issue

```bash
gh issue view <number> --repo normalled/apijack --comments --json number,title,body,labels,comments
```

Read the title, body, labels, and all comments.

**Label gate:** the issue MUST have the `needs triage` label to proceed. If it doesn't:

- The issue may already be triaged — STOP and confirm with the user before continuing.
- If the user confirms re-triage is intended, proceed.

To list issues that are ready to triage:

```bash
gh issue list --repo normalled/apijack --label "needs triage" --state open
```

### 2. Investigate

- Read any files the issue names or implies
- Check recent commits touching the same area: `git log --oneline -- <path>`
- Look at related PRs or linked issues if mentioned
- Confirm the issue still reproduces (if it's a bug) — run the command, read the code path

### 3. Assess clarity

Decide: is there enough detail to proceed to implementation without guessing?

**STOP and ask the user if ANY of these apply:**
- The issue is ambiguous (multiple valid interpretations of the ask)
- The issue mentions a **workaround** — surface it and ask whether to fix the root cause, document the workaround, or do both
- Scope is unclear (small fix vs. broader refactor)
- Acceptance criteria are missing AND the change is non-trivial
- The fix could affect backwards compatibility or public API

When asking, be specific: "The issue mentions X workaround — should I [A] fix the underlying cause, [B] make the workaround the documented solution, or [C] both?"

### 4. Summarize and hand off

Once the issue is clear, output a short summary:

- **Issue**: #NN — title
- **Root cause / desired behavior**: one or two sentences
- **Proposed approach**: one or two sentences
- **Acceptance criteria**: bullet list (explicit from the issue, or improvised if narrow scope)

Remove the `needs triage` label now that triage is complete:

```bash
gh issue edit <number> --repo normalled/apijack --remove-label "needs triage"
```

Then invoke the next skill via the `Skill` tool:

```
Skill(skill="implement-issue", args="<issue number>")
```

## Red Flags — Do Not Proceed

- "I'll figure out the ambiguity during implementation" → STOP, ask now
- "The workaround is fine, I'll just add a note" → STOP, confirm with user
- "The scope seems bigger than the issue says" → STOP, confirm with user

## Output

Your handoff to `implement-issue` must include the issue number and the summary above. Do not start implementing in this phase.
