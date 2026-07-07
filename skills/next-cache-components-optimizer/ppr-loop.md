# ppr-loop (sub-reference of next-cache-components-optimizer)

Page-render optimization: grow the static shell of a single `cacheComponents` page.

Rank candidates by visible pixel area; largest gap first.

## preflight (in addition to shared)

The page to optimize is whatever route the user is currently on (per shared preflight). Set the instant cookie (per shared `instant cookie` section), then reload.

## loop

### diagnose

1. **Check for the no-shell bailout** per SKILL.md.

2. **List candidates.** `agent-browser react suspense --only-dynamic --json` → each boundary has `jsx_source` (file:line:col) and `suspended_by[].name`. Resolve `jsx_source` (or `suspended_by[].owner_stack`) via `POST /__nextjs_original-stack-frames`.

3. **Rank by rendered area.** Per candidate, take max(fallback rect on shell-only, rendered subtree rect on full). Fallback rect alone misleads when developers used an undersized spinner.

4. **Gauge the gap.** Same capture as verify — the shell-only render. If the top-ranked candidate is sub-viewport (thin fallback bar, sidebar widget), the shell is already in good shape; surface that and offer to audit other routes for better targets, rather than forcing a marginal refactor.

5. **One boundary dominates →** that wrapper is the shell. Read inside, enumerate the awaits, recurse with those.

### decide / apply

Apply the shared lever rules from SKILL.md.

### verify

Re-take the shell-only render and compare against the baseline screenshot. The targeted gap must shrink or vanish; identical captures fail per the shared visible-delta rule. Re-check the no-shell bailout; a botched extract can break the shell.
