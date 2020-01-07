import chalk from 'chalk'
import { findConfig } from '../../../../../lib/find-config'
import { resolveRequest } from '../../../../../lib/resolve-request'
import browserslist from 'browserslist'

type CssPluginCollection_Array = (string | [string, boolean | object])[]

type CssPluginCollection_Object = { [key: string]: object | boolean }

type CssPluginCollection =
  | CssPluginCollection_Array
  | CssPluginCollection_Object

type CssPluginShape = [string, object | boolean]

const genericErrorText = 'Malformed PostCSS Configuration'

function getError_NullConfig(pluginName: string) {
  return `${chalk.red.bold(
    'Error'
  )}: Your PostCSS configuration for '${pluginName}' cannot have ${chalk.bold(
    'null'
  )} configuration.\nTo disable '${pluginName}', pass ${chalk.bold(
    'false'
  )}, otherwise, pass ${chalk.bold('true')} or a configuration object.`
}

function isIgnoredPlugin(pluginPath: string): boolean {
  const ignoredRegex = /(?:^|[\\/])(postcss-modules-values|postcss-modules-scope|postcss-modules-extract-imports|postcss-modules-local-by-default|postcss-modules)(?:[\\/]|$)/i
  const match = ignoredRegex.exec(pluginPath)
  if (match == null) {
    return false
  }

  const plugin = match.pop()!
  console.warn(
    `${chalk.yellow.bold('Warning')}: Please remove the ${chalk.underline(
      plugin
    )} plugin from your PostCSS configuration. ` +
      `This plugin is automatically configured by Next.js.`
  )
  return true
}

async function loadPlugin(
  dir: string,
  pluginName: string,
  options: boolean | object
): Promise<import('postcss').AcceptedPlugin | false> {
  if (options === false || isIgnoredPlugin(pluginName)) {
    return false
  }

  if (options == null) {
    console.error(getError_NullConfig(pluginName))
    throw new Error(genericErrorText)
  }

  const pluginPath = resolveRequest(pluginName, `${dir}/`)
  if (isIgnoredPlugin(pluginPath)) {
    return false
  } else if (options === true) {
    return require(pluginPath)
  } else {
    const keys = Object.keys(options)
    if (keys.length === 0) {
      return require(pluginPath)
    }
    return require(pluginPath)(options)
  }
}

function getDefaultPlugins(
  baseDirectory: string,
  isProduction: boolean
): CssPluginCollection {
  let browsers: any
  try {
    browsers = browserslist.loadConfig({
      path: baseDirectory,
      env: isProduction ? 'production' : 'development',
    })
  } catch {}

  return [
    require.resolve('postcss-flexbugs-fixes'),
    [
      require.resolve('postcss-preset-env'),
      {
        browsers: browsers ?? ['defaults'],
        autoprefixer: {
          // Disable legacy flexbox support
          flexbox: 'no-2009',
        },
        // Enable CSS features that have shipped to the
        // web platform, i.e. in 2+ browsers unflagged.
        stage: 3,
      },
    ],
  ]
}

export async function getPostCssPlugins(
  dir: string,
  isProduction: boolean,
  defaults: boolean = false
): Promise<import('postcss').AcceptedPlugin[]> {
  let config = defaults
    ? null
    : await findConfig<{ plugins: CssPluginCollection }>(dir, 'postcss')

  if (config == null) {
    config = { plugins: getDefaultPlugins(dir, isProduction) }
  }

  if (typeof config === 'function') {
    throw new Error(
      `Your custom PostCSS configuration may not export a function. Please export a plain object instead.`
    )
  }

  // Warn user about configuration keys which are not respected
  const invalidKey = Object.keys(config).find(key => key !== 'plugins')
  if (invalidKey) {
    console.warn(
      `${chalk.yellow.bold(
        'Warning'
      )}: Your PostCSS configuration defines a field which is not supported (\`${invalidKey}\`). ` +
        `Please remove this configuration value.`
    )
  }

  // Enforce the user provided plugins if the configuration file is present
  let plugins = config.plugins
  if (plugins == null || typeof plugins !== 'object') {
    throw new Error(
      `Your custom PostCSS configuration must export a \`plugins\` key.`
    )
  }

  if (!Array.isArray(plugins)) {
    // Capture variable so TypeScript is happy
    const pc = plugins

    plugins = Object.keys(plugins).reduce((acc, curr) => {
      const p = pc[curr]
      if (typeof p === 'undefined') {
        console.error(getError_NullConfig(curr))
        throw new Error(genericErrorText)
      }

      acc.push([curr, p])
      return acc
    }, [] as CssPluginCollection_Array)
  }

  const parsed: CssPluginShape[] = []
  plugins.forEach(plugin => {
    if (plugin == null) {
      console.warn(
        `${chalk.yellow.bold('Warning')}: A ${chalk.bold(
          'null'
        )} PostCSS plugin was provided. This entry will be ignored.`
      )
    } else if (typeof plugin === 'string') {
      parsed.push([plugin, true])
    } else if (Array.isArray(plugin)) {
      const pluginName = plugin[0]
      const pluginConfig = plugin[1]
      if (
        typeof pluginName === 'string' &&
        (typeof pluginConfig === 'boolean' || typeof pluginConfig === 'object')
      ) {
        parsed.push([pluginName, pluginConfig])
      } else {
        if (typeof pluginName !== 'string') {
          console.error(
            `${chalk.red.bold(
              'Error'
            )}: A PostCSS Plugin must be provided as a ${chalk.bold(
              'string'
            )}. Instead, we got: '${pluginName}'.`
          )
        } else {
          console.error(
            `${chalk.red.bold(
              'Error'
            )}: A PostCSS Plugin was passed as an array but did not provide its configuration ('${pluginName}').`
          )
        }
        throw new Error(genericErrorText)
      }
    } else {
      console.error(
        `${chalk.red.bold(
          'Error'
        )}: An unknown PostCSS plugin was provided (${plugin}).`
      )
      throw new Error(genericErrorText)
    }
  })

  const resolved = await Promise.all(
    parsed.map(p => loadPlugin(dir, p[0], p[1]))
  )
  const filtered: import('postcss').AcceptedPlugin[] = resolved.filter(
    Boolean
  ) as import('postcss').AcceptedPlugin[]

  return filtered
}
