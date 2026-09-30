const path = require('node:path')

/** @type {import('next').NextConfig} */
module.exports = {
  adapterPath: require.resolve('./my-adapter.mjs'),
  turbopack: {
    // Wider than the repository root, which the test pins to this directory.
    root: path.dirname(__dirname),
  },
}
