### Core Changes

- fix: preserve cache behavior for PPR fallback shells with root params: #88556
- Turbopack: Use a real file entrypoint for Workers (and SharedWorkers): #88602
- Turbopack: Various cleanup for turbo-tasks-fs, mostly retry logic and string formatting: #88668
- Turbopack: Tweak retry loop for link creation to try to fix os error 80 on Windows: #88669
- feat: Replace InnerStorage with the generated TaskStorage struct: #88355
- Turbopack: Use webpki-root-certs in addition to rustls-platform-verifier on Linux for bare-bones Linux images without root CA stores: #88869
- refactor: migrate to typed accessors and remove CachedDataItem adapter: #88397
- stabilize browser log forward options: #88857
- [devtools] Wrap long file names of stack frames in the error overlay: #88886
- [devtools] Fix notch coloring of error overlay in forced colors mode: #88892
- Turbopack: query conditions in rules follow-ups: #88801
- Create-next-app update message: #88706
- Turbopack: Fix next/font preloading for page.mdx: #88848
- Remove `deploymentId` from App Router `RenderOptsPartial`: #88866
- feat: implement LRU cache with invocation ID scoping for minimal mode response cache: #88509
- [prebuilt-skew-protection] feat: adding in automatic deploymentId: #88496
- [devtool] Add hydration diff indicator for diff lines: #88919
- Turbopack: refactor data storage to avoid reverse task cache: #88492
- Turbopack: change invalidator and immutable to data category: #88889
- Turbopack: reduce cache size: #88929
- Turbopack: improve module type error message: #88815
- Turbopack: improve selective read support to allow `Equivalent` keys: #88760
- Turbopack: add indirection layer for better caching during resolving: #80062
- Revert "[prebuilt-skew-protection] feat: adding in automatic deploymentId": #88942
- Turbopack: add `?dpl=` to all asset urls returned by Turbopack: #88828
- feat(next-codemod): add agents-md command for AI coding agents: #88961
- [Reapply] Add `useEffectEvent` to disallowed React APIs in Server Components: #88985
- Apply fixes for onBuildComplete and route module: #88831
- Rename `renderOpts.nextExport` to `isBuildTimePrerendering`: #88951
- Turbopack: remove Asset supertrait from Module trait. Modules don't have content: #86416
- Fix react-loadable-manifest chunk hash mismatch by preserving async loader mapping: #88775
- refactor: consume global-error from loader tree: #88437
- Fix chunk loading when using `__turbopack_load_by_url__` with query: #88899
- [mcp] change the mcp endpoint response to JSON: #88911
- Reapply "[turbopack] Add bundling support for worker_threads" (#88725): #88967
- fix: ensure LRU cache items have minimum size of 1 to prevent unbounded growth: #89040
- Use null-prototype objects in server actions manifests: #89069
- Re-enable types-and-precompiled: #89070

### Documentation Changes

- docs: add skill for updating Next.js documentation: #88656
- Docs: Add Next.js Glossary: #88811
- docs: Server functions rename: #86827
- docs: Update Partytown URLs and package reference: #88928
- docs: improve clarity in cache components and server/client docs: #88946
- docs: revalidatePath w/ rewrites and trailing slash: #88956
- docs: fix typos in `README.md`s: #89022
- Cache Component Guide: Building public, _mostly_ static pages: #87248

### Misc Changes

- Turbopack: Add file write invalidation tracking to filesystem watcher fuzzing: #88665
- Turbopack: Move fuzzer for fs watcher into a separate file/module: #88666
- Upgrade React from `d2908752-20260119` to `b546603b-20260121`: #88860
- Turbopack: Add a stress test / fuzzer that tries creating many symlinks in a tight loop: #88667
- Turbopack: Make the priority_runner testcase deterministic: #88651
- Turbopack: [chore] Fix Rust check warnings: #88871
- Update Rspack production test manifest: #88882
- [test] Skip failing deploy test in `searchparams-reuse-loading.test.ts`: #88821
- [test] Skip flaky `prefetch-runtime` tests for deploy tests: #88826
- remove gt workflow from agents.md: #88918
- fix typo: #88934
- Add Graphite workflow Cursor command: #88939
- [turbopack] add task type infromation to the print_cache_item_size feature: #88925
- Upgrade React from `b546603b-20260121` to `24d8716e-20260123`: #88963
- Update Rspack production test manifest: #88930
- Update Rspack development test manifest: #88931
- Improve performance and token usage of `/ci-failures` command: #88960
- Update font data: #88975
- Improve agents-md prompt to force doc retrieval: #88997
- [Turbopack] Use a presized scratch buffer for task encoding: #88924
- Update Rspack development test manifest: #89004
- Update Rspack production test manifest: #89003
- [test] Improve deployment skew test for Pages Router data routes: #89038
- Upgrade React from `24d8716e-20260123` to `8c34556c-20260126`: #89066
- Fix reset deploy project script: #89001

### Credits

Huge thanks to @bgw, @brookemosby, @dango0812, @delbaoliveira, @eps1lon, @gaojude, @hanzala-sohrab, @huozhi, @icyJoseph, @ijjk, @lukesandberg, @mischnic, @mmastrac, @msmx-mnakagawa, @sokra, @timneutkens, @unstubbable, @wyattjoh, and @ztanner for helping!
