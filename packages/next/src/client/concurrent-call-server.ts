// The concurrent implementation of callServer (app-call-server.ts). Callers
// must never import this module directly; when
// `experimental.concurrentRouterQueue` is enabled, imports of
// './app-call-server' resolve here at the bundler level (see
// create-compiler-aliases.ts and next_import_map.rs), and neither
// app-call-server.ts nor the sequential implementation is bundled at all.
//
// This module must remain free of side effects at module scope; see the note
// in concurrent-router-queue.ts.
//
// TODO: This is currently a stub. It throws so that enabling the flag fails
// loudly instead of silently running the old implementation.

export async function callServer(
  _actionId: string,
  _actionArgs: any[]
): Promise<unknown> {
  // Keep in sync with the identical message in concurrent-router-queue.ts, so
  // all unimplemented behavior shares a single error (and error code).
  throw new Error(
    'Not implemented: this behavior is not yet supported when ' +
      '`experimental.concurrentRouterQueue` is enabled.'
  )
}

// Type-only conformance check: this module must expose exactly the surface of
// the app-call-server interface. Fails to typecheck if a signature drifts.
// Compiles to `const _conformance = null` — no runtime effect.
const _conformance: typeof import('./app-call-server') =
  null as unknown as typeof import('./concurrent-call-server')
