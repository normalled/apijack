---
name: next-deployer
description: Use after merging an issue PR to dev on apijack — fast-forwards the rolling next branch from dev, waits for the publish-next workflow, and comments the @next install command on the issue
---

# Next Deployer

Phase 4 (terminal) of the apijack issue workflow. Roll `next` forward to `dev` and announce the pre-release on the issue.

## Background

`next` is the "nightly" / edge rolling branch. Pushing to `next` triggers the `publish-next` job in `.github/workflows/publish.yml`, which computes and publishes a `X.Y.Z-next.N` version to npm under the `@next` dist-tag.

## When to Use

- Invoked by `review-issue` immediately after merging an issue PR to `dev`
- User explicitly asks to deploy the current `dev` state to `next`

## Steps

### 1. Check if next is behind dev

```bash
git fetch origin dev next
BEHIND=$(git rev-list --count origin/next..origin/dev)
echo "next is behind dev by $BEHIND commits"
```

If `BEHIND` is `0`: `next` is already up to date — skip to step 4.

### 2. Fast-forward next from dev and push

Run:

```bash
.claude/skills/next-deployer/scripts/ff-next-from-dev.sh
```

The script fetches origin, pulls `dev`, checks out `next` (creating it from `origin/next` if missing), fast-forwards it from `origin/dev`, pushes, and returns to `dev`. It exits non-zero on a non-fast-forward — no force-push.

If it exits non-zero (next has diverged or push failed), STOP and ask the user how to proceed.

### 3. Capture the published commit SHA

```bash
NEXT_SHA=$(git rev-parse origin/next)
echo "next is at $NEXT_SHA"
```

### 4. Wait for the publish-next workflow

Run:

```bash
.claude/skills/next-deployer/scripts/wait-for-publish-next.sh "$NEXT_SHA"
```

Inputs:
- `$NEXT_SHA` — the commit SHA on `next` whose `publish.yml` run we want to watch.

The script polls `gh run list` (handling the race where the workflow hasn't registered yet), then `gh run watch --exit-status`. On failure it dumps `gh run view --log-failed` and propagates the non-zero code.

If the script exits non-zero, STOP, report the failure to the user, and do not comment on the issue.

### 5. Get the published version

```bash
NEXT_VERSION=$(npm view @apijack/core@next version)
echo "Published: $NEXT_VERSION"
```

Expect a value like `1.8.0-next.1`.

### 6. Comment on the issue and label it

Run:

```bash
.claude/skills/next-deployer/scripts/comment-deployed.sh <issue-number> "$NEXT_VERSION"
```

Inputs:
- `<issue-number>` — passed in from `review-issue`, or parsed from the merge commit body (`Closes #NN`).
- `$NEXT_VERSION` — the version string from step 5.

The script writes the install-instructions markdown to a tempfile, posts it via `gh issue comment --body-file` (avoiding the inline-`--body` backtick-escape footgun), and applies the `deployed to next` label.

### 7. STOP

Report to the user:
- `next` was advanced (or was already current)
- Published version
- Issue comment URL
- Issue labeled `deployed to next`

Do not chain into further skills. The workflow is complete.

## Red Flags

- `next` has diverged from `dev` (non-fast-forward) → STOP, ask user; never force-push
- Publish workflow failed → STOP, do not comment on issue
- Cannot determine issue number → STOP, ask user
