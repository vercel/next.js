const fs = require('node:fs')

module.exports = {
  plugins: [
    {
      // Replaces `from-placeholder` with whether PostCSS was given the path of
      // an existing file in `from`, including for files in an additional root.
      postcssPlugin: 'check-from',
      Declaration(decl, { result }) {
        if (decl.value === "'from-placeholder'") {
          const { from } = result.opts
          decl.value = JSON.stringify(
            from && fs.existsSync(from) ? 'from-exists' : `from-missing:${from}`
          )
        }
      },
    },
  ],
}
