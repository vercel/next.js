// TypeScript PostCSS config file (.mts)
import plugin from './plugin.mjs'

type PluginConfig = Record<string, unknown> | boolean | (() => unknown)

interface PostCSSConfig {
  plugins: PluginConfig[]
}

const config: PostCSSConfig = {
  plugins: [plugin],
}

export default config
