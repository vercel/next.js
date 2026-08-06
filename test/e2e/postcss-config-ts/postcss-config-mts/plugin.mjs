// Custom PostCSS plugin that transforms color: red to color: green
// This allows us to verify that the PostCSS config is actually being applied

const plugin = () => {
  return {
    postcssPlugin: 'color-transform',
    Declaration: {
      color(decl) {
        if (decl.value === 'red') {
          decl.value = 'green'
        }
      },
    },
  }
}

plugin.postcss = true

export default plugin
