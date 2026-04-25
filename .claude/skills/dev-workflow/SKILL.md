---
name: dev-workflow
description: Use for all development work on apijack — branch off dev, implement, PR into dev, wait for the automated reviewer, address feedback, repeat
---

# apijack Development Workflow

All development work starts on a feature branch off `dev` and ships via a PR back into `dev`. **Never commit to `dev` directly.** Prefer a fresh git worktree for full isolation.

## Workflow Overview

```
main <-- (release flow) <-- dev <-- merge PR <-- feature/<name>
```

Five phases:

1. **Evaluate** — understand the task before touching code
2. **Implement** — branch, code, test
3. **Create a PR into `dev`** — written for the automated reviewer
4. **Wait for review** — `scripts/wait-for-review.sh <pr>`
5. **Address feedback** — resolve blocking, decide on non-blocking, loop

## Phase 1: Evaluate

Before any code is written, understand the task.

- If there's a ticket/issue, read it. Note any **acceptance criteria** stated there.
- Identify scope, files involved, and testing strategy.
- If anything is ambiguous, **ask clarifying questions** rather than guessing. Do not decide in silence — surface assumptions to the user.

## Phase 2: Implement

### Set up an isolated branch

Always work on a new feature branch off an up-to-date `dev`. Ideally use a worktree.

**Worktree (preferred):**

```bash
git fetch origin
git worktree add ../apijack-<feature> -b <branch> origin/dev
cd ../apijack-<feature>
```

**In-place branch (if not using a worktree):**

```bash
git fetch origin
git checkout -b <branch> origin/dev
```

If `dev` is behind `main` (e.g., right after a release), sync it first:

```bash
git checkout dev
git pull origin dev
git merge origin/main   # bring release commits into dev
git push origin dev
```

Then branch off the synced `dev`.

### Implement and verify

- Follow existing patterns; keep changes focused on the task.
- Write tests for new behavior.
- Run `bun test` — must pass.
- Run `bun run lint` — 0 errors (warnings are pre-existing and OK).
- Run `bun run build:plugin` if any `src/mcp-server*.ts` file changed.
- Commit with conventional-commits style (`feat:`, `fix:`, `chore:`, `docs:`).

## Phase 3: Create a PR into `dev`

Push the branch and open a PR targeting `dev`. The PR body is read by the automated reviewer agent — write it for them: clear summary, structured changes, explicit acceptance criteria.

```bash
git push -u origin <branch>
gh pr create --base dev --title "<conventional title>" --body "$(cat <<'EOF'
<see format below>
EOF
)"
```

When `gh pr create` returns the PR URL, **immediately proceed to Phase 4 and start the wait-for-review script.** Don't pause to summarize the diff to the user, don't ask whether to wait — kick off the wait, then update the user (or end your turn) while the script runs in the background.

### PR body format

Match the established style on existing PRs into `dev` (see #41, #42, #43, #44 for examples). Sections in order:

```markdown
## Summary

1–3 paragraphs. What's changing and why. Reference the ticket if relevant
(`Closes #N` / `Fixes #N`) and link the spec doc if there is one.

## What changes

The technical breakdown. For larger PRs, use `### Subsection` headings
(e.g., `### New X`, `### Modified Y`, `### Minor polish`). Paste short
representative code/yaml examples when they make a point faster than prose.

## Acceptance criteria

Either copied from the ticket, or stated explicitly when there is no ticket.
Each item is a checkable assertion the reviewer can verify against the diff:

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

Be concrete. Paste short examples instead of describing them. The automated reviewer reads this body directly.

## Phase 4: Wait for review

> **Context:** An automated reviewer runs on a 15-minute interval. When it finishes,
> it applies one of two labels to the PR:
> - `first pass reviewed` — accepted (no blocking issues)
> - `changes requested` — blocking issues exist
>
> Either review may also include non-blocking feedback in the body.

**As soon as the PR is open (or after pushing fixes in Phase 5), invoke the wait-for-review script and just sit on it.** Don't ask the user whether to wait, don't hand them the command — run it yourself and block on it. The whole point of the script is so you can do this without busy-polling or burning context on intermediate checks.

```bash
./scripts/wait-for-review.sh <pr-number>
```

How to invoke it depends on the harness:

- **Claude Code (Bash tool):** run with `run_in_background: true`. The Bash tool's default 2-minute foreground timeout would otherwise kill the script while it's legitimately waiting. Background mode delivers a completion notification when the script exits, with the verdict + review body in the output. Don't poll, don't sleep, don't proactively check on it — the notification is the trigger.
- **Other harnesses without async-Bash:** invoke the script with whatever long-running-process facility the harness offers, or shell out and accept that the call will block for up to ~15 minutes.

The script itself:
- Captures the latest review timestamp at start (so re-runs after a Phase 5 push correctly wait for the *next* review, not the previous one).
- Polls every 60s for a new review carrying one of the two target labels.
- Prints the verdict label and the review body when it fires, then exits 0.

Don't hand-roll polling. Don't fall back to `gh pr view` + sleep loops. The script handles timestamp tracking and label matching correctly; reinventing it leads to subtle bugs (re-firing on stale reviews, missing the new label transition, etc.).

When the script exits, you have the verdict — proceed to Phase 5 immediately.

## Phase 5: Upon receiving a review

When the script returns, you MUST:

1. **Read the entire review comment.** Categorize each item as **blocking** or **non-blocking**. The label gives the verdict; the body says what to do.

2. **If the label is `changes requested`, you MUST evaluate and resolve every blocking item.** Do not declare the work done while a `changes requested` label is the active verdict.

3. **For non-blocking feedback (with either label), decide per item:**
   - **Fix on the spot** if it's quick, low-risk, and clearly relevant to this PR's scope.
   - **File a follow-up issue** if it's out of scope (different feature, separate refactor, broader discussion). The follow-up issue MUST reference this PR (e.g., `Spawned from #<this-PR>`):
     ```bash
     gh issue create --title "<title>" --body "Spawned from #<pr>. <description>"
     ```
   - When in doubt, ask the user.

4. **After pushing changes, immediately re-invoke the wait-for-review script (return to Phase 4).** The reviewer detects the new commit, runs again, and applies a fresh label. Don't ask whether to wait — just kick off the next wait. Loop until the latest verdict is `first pass reviewed` with no outstanding blocking items.

## Commit message convention

Conventional commits:

- `feat: ...` — new feature
- `fix: ...` — bug fix
- `chore: ...` — maintenance / refactor
- `docs: ...` — documentation
- Include `BREAKING CHANGE:` in the commit body for breaking changes

## Key commands reference

| Task | Command |
|------|---------|
| Run tests | `bun test` |
| Run lint | `bun run lint` |
| Fix lint | `bun run lint:fix` |
| Build plugin | `bun run build:plugin` |
| Wait for review | `./scripts/wait-for-review.sh <pr>` |
| View PR | `gh pr view <pr>` |
| View PR labels | `gh pr view <pr> --json labels --jq '.labels[].name'` |
| View latest review | `gh pr view <pr> --json reviews --jq '.reviews \| last \| .body'` |

## Testing plugin changes locally

If MCP tools or skills changed and you want to test interactively in Claude Code:

```bash
./scripts/dev-plugin.sh            # build + overwrite plugin cache
# Run /reload-plugins in Claude Code

# When done:
./scripts/dev-plugin.sh --restore  # restore original cache
# Run /reload-plugins again
```

## Important notes

- **Never commit to `dev` directly.** Always work on a feature branch and PR into `dev`.
- **Always branch off the latest `origin/dev`.** Stale bases cause merge pain.
- **Rebuild the plugin bundle** (`bun run build:plugin`) when changing `src/mcp-server*.ts` — the bundle is committed and is loaded at runtime.
- **Do not run `scripts/ship.sh` from this workflow.** That script is for the dev → main release flow and is not part of feature development.
