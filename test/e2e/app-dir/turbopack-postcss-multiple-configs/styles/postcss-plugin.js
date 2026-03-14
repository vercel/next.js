// Shared PostCSS plugin used by each per-directory postcss.config.js.
// Transforms `color: red` → `color: green` to verify PostCSS processing.
const plugin = () => ({
  postcssPlugin: 'test-color-transform',
  Declaration: {
    color(decl) {
      if (decl.value === 'red') {
        decl.value = 'green'
      }
    },
  },
})
plugin.postcss = true
module.exports = plugin
