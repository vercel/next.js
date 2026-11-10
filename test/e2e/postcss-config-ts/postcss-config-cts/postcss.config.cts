// TypeScript PostCSS config file (.cts)
const plugin = require('./plugin.cjs')

type PluginConfig = Record<string, unknown> | boolean | (() => unknown)

interface PostCSSConfig {
  plugins: PluginConfig[]
}

const config: PostCSSConfig = {
  plugins: [plugin],
}

module.exports = config
