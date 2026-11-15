// A PostCSS config is required to make Turbopack run the CSS through its
// Node.js side process (`PostCssTransformedAsset`), which is the code path
// that fails when the side process cannot use a local port.
module.exports = { plugins: [require('./noop-postcss-plugin')] }
