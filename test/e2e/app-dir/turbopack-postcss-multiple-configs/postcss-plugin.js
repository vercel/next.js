// Custom PostCSS plugin that transforms color: red to color: green
// Used to verify PostCSS config is loaded and applied
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
