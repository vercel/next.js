// Evaluated by Turbopack's build-time execution context.
const configUrl = import.meta.url

export default {
  plugins: [
    {
      postcssPlugin: 'inject-config-url',
      Declaration(decl) {
        if (decl.prop === '--config-url') {
          decl.value = JSON.stringify(configUrl)
        }
      },
    },
  ],
}
