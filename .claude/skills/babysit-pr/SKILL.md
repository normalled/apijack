---
name: babysit-pr
description: Use when an open apijack PR (base `dev`) is mid-review-cycle and needs to be driven to `first pass reviewed`. Picks up cold from any in-flight state — `changes requested`, `review in progress`, `needs review`, or freshly opened. Covers both interactive and `--non-interactive` (cron) modes.
---

# Babysit PR

Take over an open apijack PR mid-cycle and drive it to `first pass reviewed`. Loops review → respond → wait until done.

This skill **does not merge**. After `first pass reviewed` lands, stop and report — the `final-review` skill (with its soak window) owns the merge.

## When to Use

- An open apijack PR with base `dev` exists and you're picking it up cold.
- Current label is `changes requested`, `review in progress`, `needs review`, or no review-state label yet.

## When NOT to Use

- PR base is `main` → out of scope. That path is `ship-release` / `patch-deployer`.
- PR is closed or merged → nothing to do.
- Label is already `first pass reviewed` with no outstanding blocking items → report and stop; do not re-review.
- You are creating a brand-new PR → that's `implement-issue`.
- You are merging a `first pass reviewed` PR → that's `final-review`.

## Modes

**Interactive (default)**: a human is available to answer questions.

**Non-interactive**: triggered when **either** of:
- The skill is invoked with the literal flag `--non-interactive`.
- The prompt says "you are running non-interactively" or equivalent cron framing.

In non-interactive mode you make the best decision with the context you have, or halt and report — never ask the user.

## Steps

### 1. Identify the PR and refuse if out of scope

```bash
gh pr view <pr> --json number,state,baseRefName,headRefName,headRefOid,labels,reviewDecision,url
gh pr checks <pr>
```

Refuse and stop if `state` ≠ `OPEN` or `baseRefName` ≠ `dev`. Capture `headRefOid` — you'll re-check it before pushing to detect concurrent force-pushes.

### 2. Get on the branch

If a worktree exists at `../apijack-<slug>`, `cd` there. Otherwise:

```bash
gh pr checkout <pr>
```

### 3. Pull the FULL latest review (do not trust the prompt's summary)

The prompt may have pasted only an excerpt. Always re-fetch:

```bash
# Latest top-level review body
gh pr view <pr> --json reviews --jq '.reviews | sort_by(.submittedAt) | .[-1] | {state, author: .author.login, submittedAt, body}'

# Inline (line-anchored) review comments — often carry the specifics
gh api "repos/{owner}/{repo}/pulls/<pr>/comments" --jq '.[] | {path, line, user: .user.login, body, created_at}'

# Conversation comments (human follow-ups after the bot review)
gh pr view <pr> --comments --json comments --jq '.comments | sort_by(.createdAt) | .[] | {user: .author.login, createdAt, body}'
```

Treat the live review as truth. If it disagrees with the prompt's summary, the live review wins.

### 4. Branch on the current label

| Label | Action |
|-------|--------|
| `first pass reviewed` (no outstanding blockers) | Report and STOP. Done. |
| `review in progress`, `needs review`, no review-state label | Skip to step 8 (wait). |
| `changes requested` | Continue to step 5. |

### 5. Categorize each blocking item: simple vs non-trivial

For every blocking item in the latest review:

- **Simple**: localized (single file, ≲ 10 lines), unambiguous fix, no public-API or design impact. Examples: variable rename, typo, missing flag, exit-code propagation bug with a clearly correct patch suggested by the reviewer.
- **Non-trivial**: multi-file, public API or generated-code surface, design tradeoff, or you don't know what the right fix is.

> **Sanity-check the review against reality.** If the review references a symbol or path that doesn't exist (e.g., `tmpFile` in a file that has no such variable, or `src/plugins/` when the dir is `src/plugin/`), do not silently invent an interpretation. **Treat as non-trivial** and use step 7.

If **all** blocking items are simple → step 6. If **any** is non-trivial → step 7.

### 6. Apply simple fixes

Edit surgically. Do not "improve" adjacent code. Do not match verification depth to your enthusiasm — match it to the change:

- For shell-only changes: `bash -n <script>` is sufficient. Optionally `shellcheck` if available.
- For TypeScript/source changes: `bun test` and `bun run lint` (both must pass).
- Skip `bun test` only if no `.ts` file changed. `bun run lint` is cheap — always run it for source changes.

**Subagent code-review (`Skill(skill="superpowers:requesting-code-review")`) is OPTIONAL for one-line / single-file trivial fixes. REQUIRED for multi-file diffs or anything you'd hesitate to push without a second pair of eyes.**

Then go to step 9.

### 7. Non-trivial: gather context, then decide

#### 7a. Interactive mode

Ask the user with this exact menu structure (adapt the bulleted findings to the actual review):

```
The blocking items are:
- <item 1 with one-line classification: simple/non-trivial and why>
- <item 2 ...>
- <item 3 ...>

<short summary of what's hard about the non-trivial items>

Would you like me to:

1. Evaluate the full scope, background & reasoning of the PR (PR body, linked issue via "Closes #N", prior discussions, commit history)
2. Investigate the code changes directly (diff + relevant files)
3. Both 1 & 2 sequentially
4. Both 1 & 2 dispatched as parallel subagents
```

Wait for the answer. Then:
- **1** → load PR body + `gh issue view <linked>` + earlier reviews / discussions
- **2** → `gh pr diff <pr>` + targeted reads on the cited files
- **3** → 1 then 2
- **4** → invoke `superpowers:dispatching-parallel-agents` with two subagent prompts (one for scope, one for code)

When you have the context, **propose the fix to the user with explicit options** (e.g., rename / document / push back on reviewer). **Never silently pick.** It's fine to surface a third option the reviewer didn't mention if it's smaller / safer — but present it as an option, don't apply it. Once the user picks, return to step 6.

#### 7b. Non-interactive mode

Gather context progressively. Stop at the first level that gives you a confident, low-risk fix:

1. **Code first**: `gh pr diff <pr>` + read cited files.
2. **PR body**: PR description, prior reviews, comments.
3. **Linked issue**: `gh issue view <N>` for the issue referenced by `Closes #N`.

If after all three you still can't make a confident fix, **halt and report** (do not push a guess):

```bash
# Use the Write tool to write the report body to a tempfile, then:
gh pr comment <pr> --body-file <path>
exit 1
```

The comment must include:
- A clear "🤖 babysit-pr halted" header so a human can spot it.
- What context you gathered.
- Why you couldn't make a confident fix.
- What additional input is needed.

Always use `--body-file`, never inline `--body` — backticks get silently escaped otherwise (project CLAUDE.md).

### 8. Wait for the next review

The automated reviewer runs on a `*/5 * * * *` cron — every 5 minutes (e.g., 7:45, 7:50, 7:55). After a push, expect the verdict on the *next* tick plus reviewer wall time. Total wait is typically 5–10 minutes, sometimes more for big diffs.

**Use the existing wait script. Do not hand-roll polling.**

```bash
./scripts/wait-for-review.sh <pr>
```

In Claude Code: invoke via the Bash tool with `run_in_background: true`. The foreground 2-minute timeout would kill the script mid-wait. Background mode delivers a completion notification on exit, with the verdict and review body in the output.

The script captures the latest-review timestamp at start, so it correctly waits for the *next* review even across multiple push cycles.

When the notification fires, read the verdict and return to step 4.

### 9. Commit and push

```bash
# Re-confirm headRefOid hasn't changed underneath you
gh pr view <pr> --json headRefOid

git add <files>
git commit -m "<type>: <description> (#<issue>)"
git push
```

Conventional commit prefix:
- `chore:` — skill scripts, CI, automation, anything not in `@apijack/core`'s published surface.
- `fix:` — behavior bugs in published code.
- `feat:` — new published API (triggers minor bump).
- `BREAKING CHANGE:` trailer for breaking changes.

**No `Co-Authored-By` lines. No `--amend`. No `--force-push`.** Fresh commit on top.

Then go to step 8.

## Stop conditions

Halt and report (do not loop further) when:

- Latest verdict is `first pass reviewed` with no outstanding blocking items → success, report PR URL + verdict, stop.
- Non-interactive and stuck after all three context levels → posted a halt comment + exit non-zero.
- Two consecutive review cycles flag the *same* blocking item → you're misreading the request, escalate to a human (interactive: ask; non-interactive: PR comment + exit).
- Repo state diverged underneath you (force-push, branch deleted, `headRefOid` changed mid-fix) → report and stop.
- CI is red for a reason unrelated to your diff → report and stop.

## Red Flags

| Thought | Reality |
|---------|---------|
| "I'll merge this myself once it's clean" | STOP — that's `final-review`'s job. |
| "I'll skip `wait-for-review.sh` and use `/loop` or `ScheduleWakeup` or a `gh pr view` sleep" | STOP — the script is the only correct wait. |
| "The review is wrong, I'll quietly ignore it" | Push back explicitly via PR comment. Never silently. |
| "It's a one-liner, no need to lint" | `bun run lint` is cheap. Run it for source changes. |
| "It's a one-liner — I have to dispatch a subagent code-review" | Subagent review is OPTIONAL for trivial fixes. Match depth to change size. |
| "Non-trivial but I'll guess and push" | Interactive: ask the user with the 4-option menu. Non-interactive: progressive context, then halt-and-report. |
| "The review cites a symbol that doesn't exist; I'll patch the closest match" | Treat as non-trivial — sanity-check before fixing. |
| "I'll wait foreground" | `run_in_background: true` is mandatory in the Bash tool. |
| "The prompt's review summary is enough; I don't need to fetch the live one" | Always re-fetch the live review. The prompt may be stale or truncated. |
| "I'll only check the top-level review body" | Inline review comments often carry the actionable specifics — fetch them too. |
| "I'll force-push / amend" | Fresh commit on top. Never amend, never force. |

## Output

Either:
- **Success**: PR URL + final verdict (`first pass reviewed`) + one-liner of what changed in the fix commit(s).
- **Halt-and-report**: PR comment posted + non-zero exit (non-interactive) or message to user + stop (interactive).
