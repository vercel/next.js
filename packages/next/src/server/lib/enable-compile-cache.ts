import Module from 'module'

/**
 * Enables the Node.js on-disk module compile cache (Node.js >= 22.8) for the
 * current process, so later `next dev` startups skip re-compiling Next.js'
 * own (large) CommonJS modules.
 *
 * - Only modules loaded after this call are cached.
 * - No directory is passed, so Node.js' default location is used
 *   (`os.tmpdir()/node-compile-cache`). A user-provided `NODE_COMPILE_CACHE`
 *   takes precedence and `NODE_DISABLE_COMPILE_CACHE` disables it; both are
 *   handled by Node.js itself.
 * - Node.js keys the cache by Node.js version and V8 flags and validates every
 *   entry against the module's source hash, so stale entries are ignored.
 * - It is not inherited by child processes; each process enables it itself.
 */
export function enableCompileCache(): void {
  try {
    const { enableCompileCache: enable } = Module as typeof Module & {
      enableCompileCache?: () => unknown
    }
    if (typeof enable === 'function') {
      enable()
    }
  } catch {
    // The compile cache is a best-effort optimization.
  }
}

// The `next dev` server process is forked from the CLI and imports this module
// first, so it can enable the cache before loading the rest of the server.
if (process.env.__NEXT_DEV_SERVER === '1') {
  enableCompileCache()
}
