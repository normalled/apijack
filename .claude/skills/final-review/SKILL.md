---
name: final-review
description: Use after a PR has been labeled `first pass reviewed` for at least 4 minutes — verifies CI is still green and no new commits landed since the label, aggregates outstanding non-blocking observations, posts an approval comment, merges, replaces the label with `approved`, and labels every issue referenced by `Closes #N` with `merged to dev`. A failed gate or merge posts one comment and moves the label, so the PR isn't picked up again until something changes.
---

# Final Review

Phase 4 of the apijack issue workflow. The first-pass reviewer leaves a PR with `first pass reviewed`. After a 4-minute soak window — long enough for a human to intervene, short enough to keep the loop moving — the final reviewer takes the PR across the line.

## When to Use

- A PR is labeled `first pass reviewed` and the label has been there for at least 4 minutes
- CI is fully green and the PR is mergeable
- No new commits have landed on the head since the first-pass-reviewed label was applied

This skill is invoked automatically by the `final-review` cron, or manually via `/final-review <pr>`.

## Steps

### 1. Verify the gate is still satisfied

The cron's preflight already checked that the label has soaked, that no commit landed after it, and that no check run is still pending. Re-verify the rest before any write, **and capture the head SHA** — step 5 will pin the merge to it so a commit landing mid-flow can't be merged in unreviewed:

```bash
HEAD_SHA=$(gh pr view <pr> --json headRefOid --jq '.headRefOid')
gh pr view <pr> --json state,isDraft,mergeable,mergeStateStatus,labels
gh pr checks <pr>
gh api "repos/normalled/apijack/pulls/<pr>/reviews" \
    --jq 'map(select(.state == "CHANGES_REQUESTED" and .dismissed_at == null)) | length'
```

Then act on the outcome. If both a hard and a soft condition hold, it's hard.

| Outcome | Conditions | Action |
|---|---|---|
| Nothing to do | `state` isn't `OPEN`, the PR is a draft (`isDraft`), or `first pass reviewed` is no longer on the PR | STOP silently |
| Hard | any check failed, was cancelled or timed out; `mergeable` is `CONFLICTING` or `mergeStateStatus` is `DIRTY`; an active "request changes" review (the count above is non-zero) | One gate-failure comment, then `changes requested`, then STOP (below) |
| Soft | any check is `pending`, `queued` or `in_progress`; `mergeable` is `UNKNOWN` | STOP with no comment and no label change. A later tick checks again. |
| Pass | none of the above | Continue to step 2 |

`mergeable` is a string (`MERGEABLE`, `CONFLICTING` or `UNKNOWN`), not a boolean. `UNKNOWN` means GitHub hasn't finished computing it yet.

**On a hard failure:**

1. Use the `Write` tool to write `.claude-jobs/review-bodies/final-<pr>-gate-fail.md`. Name the gate that failed and say how to re-arm the PR:
   - push a fix: the review cron re-reviews a `changes requested` PR once a newer commit lands;
   - or, once a CI re-run has turned a flaky failure green, run `.claude/skills/review-issue/scripts/set-review-label.sh <pr> "first pass reviewed"`, which restarts the soak;
   - for an active "request changes" review, it also has to be dismissed (or resolved by its author) first; neither of the above clears it.
2. Post it and move the label:

   ```bash
   scripts/pr-comment.sh <pr> .claude-jobs/review-bodies/final-<pr>-gate-fail.md
   .claude/skills/review-issue/scripts/set-review-label.sh <pr> "changes requested"
   ```

3. STOP. Neither cron selects the PR again until a newer commit lands, so the comment isn't repeated every tick.

### 2. Read the prior first-pass-review body

```bash
gh api "repos/normalled/apijack/pulls/<pr>/reviews" \
    --jq 'map(select(.body // "" | startswith("> 🤖 **Automated review by claude**")))
          | sort_by(.submitted_at) | reverse | .[0].body // empty'
```

Extract the bullets inside `<details><summary>Non-blocking observations</summary> ... </details>`. These are the items to surface in the approval comment. Ignore the `Nitpicks` block — too noisy for this summary.

**If there is no first-pass review body,** the PR never had a first pass. This check runs only once step 1's gate has passed, so a hard gate failure (→ `changes requested`) wins over a missing body (→ `needs review`). Write a one-line body to `.claude-jobs/review-bodies/final-<pr>-gate-fail.md` saying so, then:

```bash
scripts/pr-comment.sh <pr> .claude-jobs/review-bodies/final-<pr>-gate-fail.md
.claude/skills/review-issue/scripts/set-review-label.sh <pr> "needs review"
```

…and STOP. The review cron gives it a first pass.

### 3. Cross-reference open issues

For each non-blocking observation, check whether an open issue already tracks it:

```bash
gh issue list --repo normalled/apijack --state open --limit 50 --json number,title,body,labels
```

Match by topical keywords from the observation (function names, file paths, behaviors). If a single open issue clearly covers the bullet, append `(#NN)`. If unclear or no match, leave the bullet alone — do **not** invent issue links.

### 4. Build the approval body

Use the `Write` tool — never inline in a heredoc — to avoid backtick-escaping artifacts.

Write the body to `.claude-jobs/review-bodies/final-<pr>.md`. Then:

```bash
.claude/skills/review-issue/scripts/post-review.sh <pr> comment .claude-jobs/review-bodies/final-<pr>.md
```

You don't need to **literally** approve the PR. Just post a comment that _says you approve_. The workflow signal is the `approved` label moved in step 6.

#### Body template

```
> 🤖 **Final review by claude** — generated by the `final-review` skill. CI is green, no blockers, soak window elapsed. Marking approved and merging.

Approved.

### Outstanding observations from first-pass review

- <bullet copied verbatim from the first-pass body> [optional `(#NN)` link if a tracking issue exists]
- <next bullet>
```

If the first-pass review had no `Non-blocking observations` block at all, omit the `### Outstanding observations` heading entirely — keep the body to two short lines.

### 5. Merge (SHA-pinned)

```bash
.claude/skills/final-review/scripts/merge-pr.sh <pr> "$HEAD_SHA"
```

The script pins the merge to `$HEAD_SHA`, so a commit landing between step 1 and step 5 causes GitHub to reject the merge with 409. A PR that isn't mergeable gets 405.

**If the script exits non-zero,** don't retry. First check whether the merge landed anyway (for example, the request timed out after GitHub merged): if `gh pr view <pr> --json state` says `MERGED`, carry on with steps 6 and 7. Otherwise:

1. Use the `Write` tool to write `.claude-jobs/review-bodies/final-<pr>-merge-fail.md`, quoting the error `merge-pr.sh` printed.
2. Post it and send the PR back for review:

   ```bash
   scripts/pr-comment.sh <pr> .claude-jobs/review-bodies/final-<pr>-merge-fail.md
   .claude/skills/review-issue/scripts/set-review-label.sh <pr> "needs review"
   ```

3. STOP.

### 6. Move the label

```bash
.claude/skills/review-issue/scripts/set-review-label.sh <pr> "approved"
```

This atomically removes `first pass reviewed` and adds `approved`. Other PR labels are untouched.

The label moves only after the merge succeeds. A run that dies before the merge leaves `first pass reviewed` in place, so the next tick re-checks the gates (or the review cron re-reviews the PR if its head moved). A run that dies after the merge leaves a closed PR, where a missing `approved` label strands nothing.

### 7. Label referenced issues with `merged to dev`

```bash
.claude/skills/final-review/scripts/label-merged-issues.sh <pr>
```

Parses the PR body for `Closes #N` / `Fixes #N` / `Resolves #N` and adds the `merged to dev` label to each referenced issue. The label marks the issue as shipped to dev, pending release to main. Idempotent and best-effort — per-issue failures are logged but do not fail the run.

### 8. Stop

This skill does NOT invoke `next-deployer`. Publishing to the rolling `next` channel is a separate concern; if you want it automated, that belongs in its own cron.

## Red Flags — Do Not Approve

- "CI has one flaky test, the rest pass" → hard gate failure: one comment, `changes requested`, STOP. A human can re-run CI and restart the soak.
- "There's a `request-changes` review but it's old / unresolved" → hard gate failure
- "The first-pass label is only 8 minutes old, close enough" → STOP, the cron will catch it next tick
- "There's a commit right after the first-pass label, but it's just a typo fix" → STOP, the first-pass review is stale. The review cron re-reviews a `first pass reviewed` PR with a newer commit; leave it to that.
- "There's no prior first-pass body to read" → one comment, `needs review`, STOP (step 2)
- "The merge failed, I'll just retry" → STOP: one comment, `needs review` (step 5)

## Output

One of:

- an approval comment, a merged PR with its branch deleted, and the `approved` label;
- a soft STOP with nothing written;
- one comment naming the failed gate or merge, a label move (`changes requested` or `needs review`), and STOP.
