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

   Keep the Corepack shim first on `PATH`. The repository pins its pnpm version
   in `package.json`, and `sync-react` starts a nested `pnpm install`. Without
   this override, a bundled or global pnpm can be selected for either command,
   ignore the repository's pnpm configuration, and attempt to download local
   workspace packages such as `@next/font` from npm.

3. Inspect the sync result before testing. Preserve unrelated changes in both
   checkouts. Rebuild Next.js when required, then run the focused test command
   matching the changed behavior.

## Build variants

The script builds stable first and moves its `node_modules` to
`build/oss-stable`. It then performs an experimental partial build and moves
its `node_modules` to `build/oss-experimental`. Do not replace it with a
generic React build: Next.js needs both release channels and the listed server,
client, compiler, scheduler, webpack, and Turbopack bundles.

## Related Skills

- `$react-vendoring` - vendored React runtime and type boundaries after syncing.
