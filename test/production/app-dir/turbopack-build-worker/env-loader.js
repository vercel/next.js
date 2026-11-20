// A webpack loader, which Turbopack runs in Node.js during the compilation.
// It exposes the environment variable the main `next build` process set, which
// must be visible to the compilation when it runs in the build worker.
module.exports = function () {
  return `export default ${JSON.stringify(String(process.env.NEXT_DEPLOYMENT_ID))}`
}
