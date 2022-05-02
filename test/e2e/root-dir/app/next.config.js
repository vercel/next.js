const path = require('path')

let withReact18 = (config) => config

try {
  // only used when running inside of the monorepo not when isolated
  withReact18 = require(path.join(
    __dirname,
    '../../../integration/react-18/test/with-react-18'
  ))
} catch (_) {}

module.exports = withReact18({
  experimental: {
    rootDir: true,
    runtime: 'nodejs',
    reactRoot: true,
    serverComponents: true,
  },
})
