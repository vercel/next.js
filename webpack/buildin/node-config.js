// Webpack ApiPlugin aliases for node execution environment.
// https://github.com/webpack/webpack/blob/master/lib/APIPlugin.js
//
// Only used within the next server process and will be properly populated
// via the next runtime.

// __webpack_require__.p = the bundle public path
exports.publicPath = '/_next/webpack'
