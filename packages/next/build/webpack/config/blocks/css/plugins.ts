import chalk from 'chalk'
import { findConfig } from '../../../../../lib/find-config'
import { resolveRequest } from '../../../../../lib/resolve-request'

export async function getPostCssPlugins(dir: string): Promise<unknown[]> {
  function load(plugins: { [key: string]: object | false }): unknown[] {
    return Object.keys(plugins)
      .map(pkg => {
        const options = plugins[pkg]
        if (options === false) {
          return false
        }

        const pluginPath = resolveRequest(pkg, `${dir}/`)

        if (options == null || Object.keys(options).length === 0) {
          return require(pluginPath)
        }
        return require(pluginPath)(options)
      })
      .filter(Boolean)
  }

  const config = await findConfig<{ plugins: { [key: string]: object } }>(
    dir,
    'postcss'
  )

  let target: unknown[]

  if (!config) {
    target = load({
      [require.resolve('postcss-flexbugs-fixes')]: {},
      [require.resolve('postcss-preset-env')]: {
        autoprefixer: {
          // Disable legacy flexbox support
          flexbox: 'no-2009',
        },
        // Enable CSS features that have shipped to the
        // web platform, i.e. in 2+ browsers unflagged.
        stage: 3,
      },
    })
  } else {
    const plugins = config.plugins
    if (plugins == null || typeof plugins !== 'object') {
      throw new Error(
        `Your custom PostCSS configuration must export a \`plugins\` key.`
      )
    }

    const invalidKey = Object.keys(config).find(key => key !== 'plugins')
    if (invalidKey) {
      console.warn(
        `${chalk.yellow.bold(
          'Warning'
        )}: Your PostCSS configuration defines a field which is not supported (\`${invalidKey}\`). ` +
          `Please remove this configuration value.`
      )
    }

    // These plugins cannot be enabled by the user because they'll conflict with
    // `css-loader`'s behavior to make us compatible with webpack.
    ;[
      'postcss-modules-values',
      'postcss-modules-scope',
      'postcss-modules-extract-imports',
      'postcss-modules-local-by-default',
      'postcss-modules',
    ].forEach(plugin => {
      if (!plugins.hasOwnProperty(plugin)) {
        return
      }

      console.warn(
        `${chalk.yellow.bold('Warning')}: Please remove the ${chalk.underline(
          plugin
        )} plugin from your PostCSS configuration. ` +
          `This plugin is automatically configured by Next.js.`
      )
      delete plugins[plugin]
    })

    target = load(plugins as { [key: string]: object })
  }

  return target
}
