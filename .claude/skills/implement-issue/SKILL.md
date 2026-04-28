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

Always work off an up-to-date `dev`. Prefer a worktree for full isolation — pass `--worktree` to also create a sibling worktree at `../apijack-<short-slug>`.

```bash
./.claude/skills/implement-issue/scripts/start-issue-branch.sh <issue-number> <short-slug> --worktree
# or, in-place branch in the current repo:
./.claude/skills/implement-issue/scripts/start-issue-branch.sh <issue-number> <short-slug>
```

If `dev` is behind `main` (e.g., right after a release), sync it first, then re-run the script:

```bash
./.claude/skills/implement-issue/scripts/sync-dev-from-main.sh
```

> **Note:** the push inside `sync-dev-from-main.sh` is the **only** push to `dev` this skill performs — a maintenance sync, not feature work. Everything else operates on the feature branch and PRs into `dev`.

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

### 8. Hand off to `babysit-pr`

From here, drive the PR through review-feedback cycles to `first pass reviewed`. The wait-for-review loop, simple-vs-non-trivial branching on review feedback, and halt-at-`first pass reviewed` behavior all live in the `babysit-pr` skill. Invoke it with the PR number:

```
Skill(skill="babysit-pr")
```

**Non-blocking feedback handling (not covered by `babysit-pr`):** `babysit-pr` only addresses *blocking* items. For any *non-blocking* observations the reviewer surfaces (with either verdict):

- **Fix on the spot** if it's quick, low-risk, and clearly relevant to this PR's scope.
- **File a follow-up issue** if it's out of scope (different feature, separate refactor, broader discussion). The follow-up issue MUST reference this PR:
  ```bash
  gh issue create --title "<title>" --body "Spawned from #<pr>. <description>"
  ```
- When in doubt, ask the user.

## STOP

Once `babysit-pr` reports `first pass reviewed` with no outstanding blocking items, **your work is done**. Do not merge — that's `final-review`'s job (after its 4-minute soak window). Do not invoke any other skill. Report the PR URL and the final verdict to the user and stop.

## Red Flags

- "I'll skip the subagent review, the change is small" → STOP, run it anyway
- "Tests fail but it's unrelated" → STOP, investigate
- "I'll merge and fix later" → STOP, you do not merge in this skill
- "I'll PR to main" → STOP, PRs target `dev`
- "I'll handle the review-feedback loop inline instead of using `babysit-pr`" → STOP, hand off
