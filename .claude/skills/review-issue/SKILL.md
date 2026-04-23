---
name: review-issue
description: Use when reviewing an open apijack PR that targets the dev branch — verifies acceptance criteria, leaves PR comments on any findings, or merges and hands off to next-deployer
---

# Review Issue PR

Phase 3 of the apijack issue workflow. Review a PR targeting `dev` against the linked issue's acceptance criteria.

## When to Use

- User asks to review an open PR on the apijack repo
- Only for PRs whose **base is `dev`** — refuse to proceed if base is `main` or any other branch

## Steps

### 1. Load the PR and linked issue

```bash
gh pr view <pr-number> --comments
gh pr diff <pr-number>
gh pr checks <pr-number>
```

Find the linked issue (`Closes #NN` in the body) and load it:

```bash
gh issue view <issue-number> --comments
```

**Abort if the base branch is not `dev`** — tell the user and stop.

### 1.5. Apply "review in progress" label

Ensure the three workflow labels exist (idempotent — safe to run every time):

```bash
gh label create "review in progress" --color "FBCA04" --description "Review is actively underway" 2>/dev/null || true
gh label create "first pass reviewed"  --color "0E8A16" --description "Review passed with no blocking issues" 2>/dev/null || true
gh label create "changes requested"    --color "D93F0B" --description "Review found blocking issues" 2>/dev/null || true
```

Apply the in-progress label and remove any stale outcome labels from a previous review cycle (including the intake `needs review` label added by the auto-label workflow):

```bash
gh pr edit <pr-number> --add-label "review in progress"
gh pr edit <pr-number> --remove-label "needs review"        2>/dev/null || true
gh pr edit <pr-number> --remove-label "first pass reviewed" 2>/dev/null || true
gh pr edit <pr-number> --remove-label "changes requested"   2>/dev/null || true
```

### 2. Establish acceptance criteria

- **Explicit** — issue lists them → use those
- **Narrow scope** — issue is a simple, well-defined fix → improvise minimal criteria (the bug no longer reproduces, relevant tests added)
- **Involved scope** — issue is multi-faceted and criteria are unclear → STOP and ask the user how to proceed

### 3. Review

Check each of:

- **Correctness**: does the diff actually solve the issue?
- **Acceptance criteria**: each criterion met?
- **Tests**: new behavior is tested; existing tests still pass (CI green)
- **Scope**: no unrelated changes smuggled in
- **Style/consistency**: matches the surrounding codebase
- **Backwards compatibility**: public API and generated output unchanged unless the issue explicitly asks

For a structured review, invoke the code-review skill on the diff:

```
Skill(skill="superpowers:requesting-code-review")
```

### 4. Decide

**If ANY blocking issue is found OR any acceptance criterion is unmet:**

Build the review body using GitHub-flavored markdown. Blocking items appear at the top; non-blocking observations and nits are hidden in collapsible `<details>` blocks. Omit any section that has no items.

```
<1-2 sentence summary of what is blocking the merge>

**Blocking:**
- <blocking item 1>
- <blocking item 2>

<details>
<summary>Non-blocking observations</summary>

- <observation 1>
- <observation 2>

</details>

<details>
<summary>Nitpicks</summary>

- <nitpick 1>

</details>

Reviewed by claude 🤖
```

Post the review and request changes:

```bash
gh pr review <pr-number> --request-changes --body "<body from template above>"
# plus inline comments via the GitHub UI or gh api if needed
```

Update labels — remove in-progress, add outcome label, ensure the opposite outcome label is absent:

```bash
gh pr edit <pr-number> --remove-label "review in progress"
gh pr edit <pr-number> --remove-label "first pass reviewed" 2>/dev/null || true
gh pr edit <pr-number> --add-label "changes requested"
```

Then **STOP**. Report findings to the user and end.

**If AND ONLY IF all criteria are met and no blocking issues are found (only non-blocking observations / nits, or nothing at all):**

Build the review body — skip the **Blocking:** section entirely. Only include non-empty `<details>` blocks for observations/nits:

```
<1-2 sentence summary confirming the PR looks good>

<details>
<summary>Non-blocking observations</summary>

- <observation 1>

</details>

<details>
<summary>Nitpicks</summary>

- <nitpick 1>

</details>

Reviewed by claude 🤖
```

Post a non-blocking comment (does not block merging):

```bash
gh pr review <pr-number> --comment --body "<body from template above>"
```

Update labels — remove in-progress, add outcome label, ensure the opposite outcome label is absent:

```bash
gh pr edit <pr-number> --remove-label "review in progress"
gh pr edit <pr-number> --remove-label "changes requested"   2>/dev/null || true
gh pr edit <pr-number> --add-label "first pass reviewed"
```

Merge the PR:

```bash
gh pr merge <pr-number> --merge --delete-branch
```

Then invoke the next skill:

```
Skill(skill="next-deployer", args="<issue-number>")
```

## Red Flags — Do Not Merge

- "CI is red but I know it's flaky" → STOP
- "The PR targets main" → STOP, do not review here
- "Acceptance criteria are missing but I'll guess" → STOP, ask the user
- "There are nits but I'll merge anyway" → leave comments, do not merge
- "I'll squash-merge" → use plain `--merge` to preserve history on `dev`

## Output

Either: PR comments + "changes requested" review and STOP, or: merged to `dev` and handed off to `next-deployer`.
