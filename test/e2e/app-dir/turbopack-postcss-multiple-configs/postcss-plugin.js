// Root PostCSS plugin that does NOT transform colors.
// The per-directory postcss.config.js files have plugins that transform
// color: red → green. If Turbopack correctly resolves per-directory configs,
// the CSS output will contain green. If it only uses this root config,
// the CSS will still contain red (meaning the test fails).
const plugin = () => ({
  postcssPlugin: 'root-noop',
  Declaration: {},
})
plugin.postcss = true
module.exports = plugin
