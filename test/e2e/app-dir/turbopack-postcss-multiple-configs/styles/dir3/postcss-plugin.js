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
