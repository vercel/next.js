// TypeScript PostCSS config file
import plugin from './plugin'

type PluginConfig = Record<string, unknown> | boolean | (() => unknown)

interface PostCSSConfig {
  plugins: PluginConfig[]
}

const config: PostCSSConfig = {
  plugins: [plugin],
}

export default config
