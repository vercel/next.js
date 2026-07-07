// Pin the Turbopack root to THIS app dir. Without this, Next infers the
// monorepo root and embeds worktree-relative module paths (e.g.
// "[project]/.claude/worktrees/…/revenue-client.js") into the RSC payload that
// `curl` receives — which would leak the source location to an agent. Pinning
// the root makes those paths app-relative ("[project]/app/…") and unresolvable
// from outside the app.
const path = require('path')

module.exports = {
  // Root at the shared eval/ dir: keeps the (symlinked) node_modules inside the
  // root while still stripping the worktree path from RSC module paths.
  turbopack: {
    root: path.resolve(__dirname, '..'),
  },
}
