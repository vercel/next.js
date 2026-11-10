// This is a minimal import that initializes the node
// environment, it is traced automatically for entries
// and can be used to ensure Node.js APIs are setup
// as expected without require `next-server`
if (process.env.NEXT_RUNTIME !== 'edge') {
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/server/node-environment')
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/server/require-hook')
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/server/node-polyfill-crypto')
}
