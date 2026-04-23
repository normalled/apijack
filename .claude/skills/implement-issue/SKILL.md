---
name: implement-issue
description: Use when a GitHub issue has been triaged and is ready for implementation on the apijack repo — creates the issue branch, implements, tests, self-reviews, and opens a PR to dev
---

# Implement Issue

Phase 2 of the apijack issue workflow. Turn a triaged issue into a reviewed PR against `dev`.

## When to Use

- After `triage-issue` has clarified the issue and handed off
- User explicitly asks to implement a specific, already-clear issue

Do not invoke this skill before triage is complete. If the issue has not been triaged, invoke `triage-issue` first.

## Steps

### 1. Create the issue branch

Slugify the issue title: lowercase, hyphenated, drop filler words, aim for 3–5 words.

```bash
git fetch origin
git checkout dev && git pull origin dev
git checkout -b issues/<number>-<short-slug>
```

Example: `issues/37-opt-in-auth` for issue #37 "Make auth opt-in".

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
- If MCP server code changed (`src/mcp-server*.ts`), run `bun run build:plugin`

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
bun run lint          # 0 errors
```

E2E tests run in CI after push (`.github/workflows/e2e.yml`). If you touched codegen, tutorial, or auth flows, expect E2E to exercise them.

### 6. Commit and push

Use a conventional commit message (`feat:`, `fix:`, `chore:`, `docs:`) that references the issue:

```bash
git add <files>
git commit -m "fix: <description> (#<issue-number>)"
git push -u origin issues/<number>-<slug>
```

Do not include Co-Authored-By lines.

### 7. Open PR to dev

```bash
gh pr create --base dev --title "<type>: <description> (#<issue-number>)" --body "$(cat <<'EOF'
Closes #<issue-number>

## Summary
<1-3 bullets>

## Test plan
- [ ] bun test passes
- [ ] bun run lint passes
- [ ] E2E CI green
EOF
)"
```

### 8. Wait for CI

```bash
gh pr checks <pr-number> --watch
```

If CI fails, fix on the branch, push, and re-watch. Do not merge.

## STOP

Once the PR is open and CI is green, **work is done**. Do not merge. Do not invoke any other skill. Report the PR URL to the user and stop.

## Red Flags

- "I'll skip the subagent review, the change is small" → STOP, run it anyway
- "Tests fail but it's unrelated" → STOP, investigate
- "I'll merge and fix later" → STOP, you do not merge in this skill
- "I'll PR to main" → STOP, PRs target `dev`
