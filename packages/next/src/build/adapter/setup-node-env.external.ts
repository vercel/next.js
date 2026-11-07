// This is a minimal import that initializes the node
// environment, it is traced automatically for entries
// and can be used to ensure Node.js APIs are setup
// as expected without require `next-server`
if (process.env.NEXT_RUNTIME !== 'edge') {
  // `next-server` sets this once it has set up the environment itself. As a
  // pre-compiled runtime bundle it does that with its own copy of the modules
  // below, so requiring them here would set up the environment a second time.
  if (
    !(globalThis as Record<symbol, unknown>)[
      Symbol.for('next.server.setup-node-env')
    ]
  ) {
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/node-environment')
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/require-hook')
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/node-polyfill-crypto')
  }
}
