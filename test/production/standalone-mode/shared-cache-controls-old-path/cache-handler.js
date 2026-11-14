// The cache handler of the build. The test replaces it in the standalone
// output with `late-cache-handler.js`.
module.exports =
  require('next/dist/server/lib/incremental-cache/file-system-cache').default
