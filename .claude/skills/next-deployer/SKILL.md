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

### 1. Sync dev locally

```bash
git fetch origin
git checkout dev && git pull origin dev
```

### 2. Check if next is behind dev

```bash
git fetch origin next
BEHIND=$(git rev-list --count origin/next..origin/dev)
echo "next is behind dev by $BEHIND commits"
```

If `BEHIND` is `0`: `next` is already up to date — skip to step 4.

### 3. Fast-forward next from dev and push

```bash
git checkout next 2>/dev/null || git checkout -b next origin/next
git merge --ff-only origin/dev
git push origin next
```

If fast-forward fails (next has diverged), STOP and ask the user how to proceed — do not force-push.

Return to `dev`:

```bash
git checkout dev
```

### 4. Wait for publish-next workflow

```bash
# Find the run triggered by this push
RUN_ID=$(gh run list --workflow publish.yml --branch next --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

If the run fails:

```bash
gh run view "$RUN_ID" --log-failed
```

STOP, report the failure to the user, and do not comment on the issue.

### 5. Get the published version

```bash
NEXT_VERSION=$(npm view @apijack/core@next version)
echo "Published: $NEXT_VERSION"
```

Expect a value like `1.8.0-next.1`.

### 6. Comment on the issue and label it

```bash
gh issue comment <issue-number> --repo normalled/apijack --body "$(cat <<EOF
Fix deployed to \`next\`. Install the exact version:

\`\`\`bash
bun install -g @apijack/core@$NEXT_VERSION
\`\`\`
EOF
)"
```

Add the `deployed to next` label so the issue's lifecycle stage is visible at a glance:

```bash
gh issue edit <issue-number> --repo normalled/apijack --add-label "deployed to next"
```

Substitute `<issue-number>` with the argument passed in from `review-issue`, or parse it from the merge commit body (`Closes #NN`).

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
