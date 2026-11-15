# Fix patterns

Read the section matching the candidate before proposing a change. Each section ends with the evidence needed to take that candidate into the main workflow's edit/measure/behavior loop.

## Lazy interaction feature

For a large component such as an editor, chart or dialog needed after interaction, inspect its actual importer and confirm the feature is not already async. Add one lazy boundary with a stable placeholder, preserving loading/error states, keyboard/focus, direct visits and client/server behavior.

Preload on intent only after measuring its benefit. Idle preloading can waste data/battery and compete with important requests.

**Ready to test:** the synchronous paths that keep the feature reachable are accounted for, and each preserved behavior has a named check.

## Duplicate browser dependency

Verify the shipped browser versions and inspect the package-manager graph (`pnpm why` or `npm ls`). Distinguish duplicate shipped JavaScript from module variants and server/client copies. Prefer compatible direct-range or parent upgrades and dedupe before overrides. If resolving duplicates requires a major-version upgrade, verify API compatibility and behavior for every affected consumer.

Check React/singleton peer constraints and hydration behavior. Recheck the resolved dependency graph and shipped browser code to ensure the change reduces duplication rather than introducing more duplicates through dependencies.

**Ready to test:** the duplicated browser code is evidenced, the resolution change is compatible with every affected consumer, and checks cover peer/hydration behavior and the resulting shipped duplication.

## Server-rendered display work

For Markdown/MDX, parsers, registries or display-only work in a Client Component, establish whether it needs live editing, offline use or browser-only inputs. Move eligible display work to server rendering with a small interactive island, or keep a lazy parser for editing. Preserve sanitizer and authorization boundaries and verify hydration.

**Ready to test:** the source work selected for relocation has no required browser-only behavior, and rendering, interaction, hydration and trust-boundary checks are named.

## Other attributed assets

Inspect polyfills, barrels, layout imports, CSS/fonts/media/WASM when the scoped attribution warrants it. Keep source/build attribution separate from observed requests: a generic asset source alone does not establish a browser request.

**Ready to test:** the exact source/importer and output contribution explain the proposed edit, and its effects on shared routes and runtime side effects are covered.
