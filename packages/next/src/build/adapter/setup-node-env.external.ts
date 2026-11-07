// This is a minimal import that initializes the node
// environment, it is traced automatically for entries
// and can be used to ensure Node.js APIs are setup
// as expected without require `next-server`
if (process.env.NEXT_RUNTIME !== 'edge') {
  // Each of these modules marks the process when it runs. A pre-compiled
  // runtime bundle has its own copy of the ones it imports, so requiring them
  // here as well would set up the environment a second time.
  const ran = globalThis as Record<symbol, unknown>
  if (!ran[Symbol.for('next.server.node-environment')]) {
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/node-environment')
  }
  if (!ran[Symbol.for('next.server.require-hook')]) {
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/require-hook')
  }
  if (!ran[Symbol.for('next.server.node-polyfill-crypto')]) {
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/node-polyfill-crypto')
  }
}
