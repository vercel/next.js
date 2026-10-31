// Stands in for a pure-JS convenience package layered over a native one, the
// role `sqlite` played over `sqlite3`. It has no dependencies of its own and
// resolves `native-addon` positionally, so it does not need a dependency edge.
//
// The caller passes an already-resolved `filename`. Keep it that way: output
// file tracing only follows a `process.cwd()`-derived path when the expression
// appears in the app's own code, since Turbopack gates that on the source not
// being inside `node_modules`.

const fs = require('fs/promises')

exports.open = async function open({ filename, driver }) {
  const rows = JSON.parse(await fs.readFile(filename, 'utf8'))

  return {
    contextAware: driver.CONTEXT_AWARE,
    all: async () => rows,
  }
}
