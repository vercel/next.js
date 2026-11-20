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
  } else {
    // One extension still has to run here. It wraps the console methods as
    // they are at this point, and whatever it wraps runs outside of the
    // render's tracking. A bundle's copy ran when the bundle was loaded, so it
    // does not cover a console method that the instrumentation hook replaced
    // after that. Where the modules above ran as files, this is the file that
    // already ran.
    // eslint-disable-next-line @next/internal/typechecked-require
    require('next/dist/server/node-environment-extensions/console-exit')
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
