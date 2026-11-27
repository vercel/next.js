// A webpack loader, which Turbopack runs in Node.js during the compilation.
// It exposes details of the process it runs in, which must match what the main
// `next build` process provides even when the compilation runs in the build
// worker.
const inspector = require('inspector')

module.exports = function () {
  const value = this.resourcePath.endsWith('inspector.probe')
    ? // Whether the loader's process has an open inspector.
      inspector.url()
      ? 'open'
      : 'closed'
    : // An environment variable `next build` set from the config.
      String(process.env.NEXT_DEPLOYMENT_ID)
  return `export default ${JSON.stringify(value)}`
}
