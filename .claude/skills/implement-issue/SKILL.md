---
name: implement-issue
description: Use when a GitHub issue has been triaged and is ready for implementation on the apijack repo — creates the issue branch, implements, tests, self-reviews, opens a PR to dev, waits for the automated reviewer, and addresses feedback in a loop
---

# Implement Issue

Phase 2 of the apijack issue workflow. Turn a triaged issue into a reviewed-and-accepted PR against `dev`.

## When to Use

- After `triage-issue` has clarified the issue and handed off
- User explicitly asks to implement a specific, already-clear issue

Do not invoke this skill before triage is complete. If the issue has not been triaged, invoke `triage-issue` first.

## Steps

### 1. Set up an isolated branch

Slugify the issue title: lowercase, hyphenated, drop filler words, aim for 3–5 words. The branch name is `issues/<number>-<short-slug>` (e.g., `issues/37-opt-in-auth` for issue #37 "Make auth opt-in").

Always work off an up-to-date `dev`. Prefer a worktree for full isolation.

**Worktree (preferred):**

```bash
git fetch origin
git worktree add ../apijack-<short-slug> -b issues/<number>-<short-slug> origin/dev
cd ../apijack-<short-slug>
```

**In-place branch (if not using a worktree):**

```bash
git fetch origin
git checkout -b issues/<number>-<short-slug> origin/dev
```

If `dev` is behind `main` (e.g., right after a release), sync it first before branching:

```bash
git checkout dev
git pull origin dev
git merge origin/main   # bring release commits into dev
git push origin dev
```

Then branch off the synced `dev`.

> **Note:** that `git push origin dev` is the **only** push to `dev` this skill performs — a maintenance sync, not feature work. Everything else operates on the feature branch and PRs into `dev`.

### 2. Plan or implement

If the issue is clear and small (single obvious change): implement directly.

If **any** of the following are true, invoke the brainstorming skill first to plan:
- Multiple files affected and the structure isn't obvious
- Public API or generated code output changes
- Multiple viable approaches with real tradeoffs

```
Skill(skill="superpowers:brainstorming")
```

### 3. Implement

- Follow existing patterns in the codebase
- Keep changes focused on the issue — no drive-by refactors
- Add or update tests alongside code changes
- If MCP server code changed (`src/mcp-server*.ts`), run `bun run build:plugin` — the bundle is committed and is loaded at runtime

### 4. Self-review

Use a subagent for an independent second pair of eyes:

```
Skill(skill="superpowers:requesting-code-review")
```

Address any issues it raises before moving on.

### 5. Verify

All must pass before PR:

```bash
bun test              # unit tests — all green
bun run lint          # 0 errors (pre-existing warnings are OK)
```

### 6. Commit and push

Use a conventional commit message (`feat:`, `fix:`, `chore:`, `docs:`) that references the issue. Include `BREAKING CHANGE:` in the body for breaking changes.

```bash
git add <files>
git commit -m "fix: <description> (#<issue-number>)"
git push -u origin issues/<number>-<short-slug>
```

Do not include Co-Authored-By lines.

### 7. Open the PR to `dev`

The PR body is read by the automated reviewer agent — write it for them: clear summary, structured changes, explicit acceptance criteria.

```bash
gh pr create --base dev --title "<type>: <description> (#<issue-number>)" --body "$(cat <<'EOF'
<see format below>
EOF
)"
```

When `gh pr create` returns the PR URL, **immediately proceed to step 8 and start the wait-for-review script.** Don't pause to summarize the diff to the user, don't ask whether to wait — kick off the wait, then update the user (or end your turn) while the script runs in the background.

#### PR body format

Match the established style on existing PRs into `dev` (see #41, #42, #43, #44 for examples). Sections in order:

```markdown
Closes #<issue-number>

## Summary

1–3 paragraphs. What's changing and why. Link the spec doc if there is one.

## What changes

The technical breakdown. For larger PRs, use `### Subsection` headings
(e.g., `### New X`, `### Modified Y`, `### Minor polish`). Paste short
representative code/yaml examples when they make a point faster than prose.

## Acceptance criteria

Copied from the triaged issue (or stated explicitly when narrow scope). Each
item is a checkable assertion the reviewer can verify against the diff:

- [ ] Behavior X works for input Y
- [ ] No regression in feature Z
- [ ] Public API surface updated for new export

## Test plan

What was verified locally:

- [x] `bun test` — N pass / 0 fail
- [x] `bun run lint` — 0 errors
- [x] Manual smoke test: `<command>` → `<expected output>`

## Spec reference (if applicable)

Link to the design doc, e.g., `docs/superpowers/specs/<file>.md`.
```

Be concrete. Paste short examples instead of describing them.

### 8. Wait for review

> **Context:** An automated reviewer runs on a 15-minute interval. When it finishes,
> it applies one of two labels to the PR:
> - `first pass reviewed` — accepted (no blocking issues)
> - `changes requested` — blocking issues exist
>
> Either review may also include non-blocking feedback in the body.

**As soon as the PR is open (or after pushing fixes in step 9), invoke the wait-for-review script and just sit on it.** Don't ask the user whether to wait, don't hand them the command — run it yourself and block on it. The script also covers CI: if CI fails, the reviewer's verdict will reflect that.

```bash
./scripts/wait-for-review.sh <pr-number>
```

How to invoke it depends on the harness:

- **Claude Code (Bash tool):** run with `run_in_background: true`. The Bash tool's default 2-minute foreground timeout would otherwise kill the script while it's legitimately waiting. Background mode delivers a completion notification when the script exits, with the verdict + review body in the output. Don't poll, don't sleep, don't proactively check on it — the notification is the trigger.
- **Other harnesses without async-Bash:** invoke the script with whatever long-running-process facility the harness offers, or shell out and accept that the call will block for up to ~15 minutes.

The script itself:
- Captures the latest review timestamp at start (so re-runs after a step-9 push correctly wait for the *next* review, not the previous one).
- Polls every 60s for a new review carrying one of the two target labels.
- Prints the verdict label and the review body when it fires, then exits 0.

Don't hand-roll polling. Don't fall back to `gh pr view` + sleep loops.

When the script exits, you have the verdict — proceed to step 9 immediately.

### 9. Address review feedback

When the script returns:

1. **Read the entire review comment.** Categorize each item as **blocking** or **non-blocking**. The label gives the verdict; the body says what to do.

2. **If the label is `changes requested`, you MUST evaluate and resolve every blocking item.** Do not declare the work done while a `changes requested` label is the active verdict.

3. **For non-blocking feedback (with either label), decide per item:**
   - **Fix on the spot** if it's quick, low-risk, and clearly relevant to this PR's scope.
   - **File a follow-up issue** if it's out of scope (different feature, separate refactor, broader discussion). The follow-up issue MUST reference this PR:
     ```bash
     gh issue create --title "<title>" --body "Spawned from #<pr>. <description>"
     ```
   - When in doubt, ask the user.

4. **After pushing changes, immediately re-invoke the wait-for-review script (return to step 8).** The reviewer detects the new commit, runs again, and applies a fresh label. Don't ask whether to wait — just kick off the next wait. Loop until the latest verdict is `first pass reviewed` with no outstanding blocking items.

## STOP

Once the latest verdict is `first pass reviewed` and there are no outstanding blocking items, **your work is done**. Do not merge — that's the `review-issue` skill's job. Do not invoke any other skill. Report the PR URL and the final verdict to the user and stop.

## Red Flags

- "I'll skip the subagent review, the change is small" → STOP, run it anyway
- "Tests fail but it's unrelated" → STOP, investigate
- "I'll merge and fix later" → STOP, you do not merge in this skill
- "I'll PR to main" → STOP, PRs target `dev`
- "I'll wait for the review by polling `gh pr view` myself" → STOP, use `wait-for-review.sh`
- "The label is `changes requested` but I think the reviewer is wrong" → resolve or push back explicitly; do not ignore it
