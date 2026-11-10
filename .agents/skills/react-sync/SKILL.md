---
name: react-sync
description: >
  Build local React changes in the bundle variants consumed by Next.js, sync
  them into a local Next.js checkout, and test the resulting integration. Use
  when working on React changes that need validation in Next.js, or when asked
  to run buildForNext, pnpm sync-react, or synchronize a React checkout with
  Next.js.
metadata:
  internal: true
---

# Sync React to Next.js

Use this skill when syncing a local React checkout into this Next.js checkout.

## Build and sync

1. Build React from its own checkout. Pass this skill's script by its absolute
   path, because the working directory must be the React repository.

   ```bash
   cd <react-repo>
   bash <next-repo>/.agents/skills/react-sync/scripts/build-for-next.sh
   ```

   This creates `build/oss-stable` and `build/oss-experimental` with the
   bundle variants that Next.js consumes.

2. Sync the build into Next.js:

   ```bash
   cd <next-repo>
   PATH="$(dirname "$(command -v corepack)"):$PATH" \
     pnpm sync-react --version <react-repo>
   ```

   Work around a Codex `PATH`-precedence bug by keeping the directory containing
   the active Corepack shim first on `PATH`. Codex injects a separate bundled
   `pnpm` executable ahead of the user's Corepack shim, and command lookup
   happens before Corepack reads the repository's `packageManager` field. The
   prefix makes both this command and `sync-react`'s nested `pnpm install`
   resolve through Corepack to the repository-pinned pnpm version. Invoking
   only the outer command with `corepack pnpm` is insufficient because the
   nested command still resolves `pnpm` from `PATH`.

3. Inspect the sync result before testing. Preserve unrelated changes in both
   checkouts. Rebuild Next.js when required, then run the focused test command
   matching the changed behavior.

## Related Skills

- `$react-vendoring` - vendored React runtime and type boundaries after syncing.
