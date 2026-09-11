// This module is the router's operation interface: one function per
// user-facing operation, called directly by the corresponding entry points
// (Link, the public router methods, the history event handlers).
//
// The navigator owns the startTransition for its operations, along with the
// centralized safety checks; callers must invoke these functions
// synchronously within the originating event.
//
// Server Actions are not a navigator operation: the action queue is
// semantically separate from the router state queue. Its entry point is
// callServer (app-call-server.ts), which forks the same way.
//
// This is the seam where the experimental rewrite of the router state
// machine forks from the existing implementation, so nothing above this
// interface may depend on how the operations are processed. The fork happens
// at the bundler level: by default this module re-exports the sequential
// router queue, but when `experimental.concurrentRouterQueue` is enabled,
// imports of this module resolve to './concurrent-router-queue' instead —
// neither this module nor the sequential implementation is bundled at all.
// The aliases live in create-compiler-aliases.ts (webpack/rspack) and
// next_import_map.rs (Turbopack). The export list below is the interface;
// both implementations expose exactly this surface.

export {
  navigate,
  push,
  replace,
  traverse,
  restore,
  legacyUrgentBFCacheRestore,
  refresh,
  hmrRefresh,
} from './sequential-router-queue'
