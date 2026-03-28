---
name: dev-workflow
description: Use for all development work on apijack — planning, implementing, testing, reviewing, and shipping changes through the dev branch with CI-gated merge to main
---

# apijack Development Workflow

All development work flows through the `dev` branch with code review and CI gates before merging to `main`.

## Workflow Overview

```
main (protected) <-- merge PR <-- dev (working branch)
```

1. **Start**: pull latest main, reset dev
2. **Loop**: plan -> implement -> test -> review (repeat until review passes)
3. **Ship**: commit, push dev, create PR, wait for CI
4. **Merge**: if CI passes, merge; if not, fix and retry
5. **Publish**: wait for publish workflow; if it fails, fix and retry

## Phase 1: Start

```bash
git checkout main && git pull
git checkout dev 2>/dev/null || git checkout -b dev
git rebase main
```

If `dev` doesn't exist yet, create it from `main`. If it does, rebase onto latest `main` to pick up any changes.

## Phase 2: Development Loop

Repeat until code review is satisfactory:

### 2a. Plan
- Understand the task requirements
- Identify which files need to change
- Consider test strategy

### 2b. Implement
- Make the code changes
- Follow existing patterns in the codebase
- Keep changes focused

### 2c. Test
- Run `bun test` — all tests must pass
- Run `bun run lint` — 0 errors (warnings are pre-existing and OK)
- Write new tests for new functionality
- Run `bun run build:plugin` if MCP server code changed

### 2d. Review
- Review the diff against main: `git diff main..HEAD`
- Check for: correctness, consistency, test coverage, backwards compatibility
- If issues found, go back to 2b

## Phase 3: Ship

Once review passes, run the ship script:

```bash
# Stage and commit
git add <changed files>
git commit -m "<conventional commit message>"

# Push dev
git push -u origin dev

# Create PR (or update existing)
gh pr create --base main --head dev \
  --title "<title>" \
  --body "<body>"
# If PR already exists, this is a no-op — the push updated it
```

### Wait for CI

Two workflows run on PRs to `main`:
- **Tests** (ci.yml): `bun test`
- **E2E** (e2e.yml): codegen against petstore, edge-cases, OAS 3.1 fixtures

Check status:
```bash
gh pr checks <pr-number> --watch
```

**If CI fails:**
1. Read the failure: `gh run view <run-id> --log-failed`
2. Fix the issue locally
3. Run `bun test` and `bun run lint` to confirm
4. Commit the fix, push to dev — CI reruns automatically
5. Repeat until green

**If CI passes:**
Merge the PR:
```bash
gh pr merge <pr-number> --merge
```

## Phase 4: Post-Merge

After merging to `main`, the **Publish** workflow runs automatically:
- Runs tests + lint + build
- Determines version bump from commit messages (feat = minor, fix = patch, BREAKING CHANGE = major)
- Bumps version in package.json, creates git tag
- Publishes to npm
- Pushes version bump commit back to main

### Wait for Publish

```bash
# Watch the publish workflow
gh run list --branch main --limit 1 --workflow publish.yml
gh run view <run-id> --watch
```

**If publish fails:**
1. Read the failure: `gh run view <run-id> --log-failed`
2. Switch back to dev: `git checkout dev && git pull origin main --rebase`
3. Fix the issue, commit, push
4. Create a new PR, merge again
5. Repeat until publish succeeds

**If publish passes:**
```bash
# Pull the version bump commit + tag
git checkout main && git pull
# Clean up dev
git checkout dev && git rebase main
```

The update check interval is 5 minutes (beta), so the new version will be prompted on next CLI run.

## Commit Message Convention

Use conventional commits — the publish workflow uses these to determine version bumps:

- `feat: ...` — new feature (minor bump)
- `fix: ...` — bug fix (patch bump)
- `chore: ...` — maintenance (patch bump)
- `docs: ...` — documentation (patch bump)
- Include `BREAKING CHANGE` in the commit body for major bumps

## Key Commands Reference

| Task | Command |
|------|---------|
| Run tests | `bun test` |
| Run lint | `bun run lint` |
| Fix lint | `bun run lint:fix` |
| Build plugin | `bun run build:plugin` |
| PR checks | `gh pr checks <num> --watch` |
| View failure | `gh run view <id> --log-failed` |
| Merge PR | `gh pr merge <num> --merge` |
| Watch publish | `gh run list --branch main --limit 1` |

## Important Notes

- **Never push directly to main** — always go through dev + PR
- **Always pull main before starting** — stale branches cause merge conflicts
- **Build the plugin bundle** (`bun run build:plugin`) if you changed any file in `src/mcp-server*.ts` — the bundle is committed but gitignored, and is built during publish
- **Clear update-check hold** if testing auto-update: `rm ~/.apijack/update-check.json`
- After publish, pull main to get the version bump: `git pull` (wait ~20s after merge for CI to push it)
