const plugin = () => {
  return {
    postcssPlugin: 'color-change',
    Declaration: {
      color(prop) {
        prop.value = 'green'
      },
    },
  }
}
plugin.postcss = true
module.exports = plugin
