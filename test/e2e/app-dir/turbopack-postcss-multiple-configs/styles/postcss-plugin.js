// Shared PostCSS plugin used by each per-directory postcss.config.js.
// Accepts { color: '<name>' } option and transforms `color: red` to the given color.
const plugin = (opts = {}) => ({
  postcssPlugin: 'test-color-transform',
  Declaration: {
    color(decl) {
      if (decl.value === 'red') {
        decl.value = opts.color || 'green'
      }
    },
  },
})
plugin.postcss = true
module.exports = plugin
