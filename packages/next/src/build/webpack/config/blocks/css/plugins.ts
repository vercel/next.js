import { bold, red, underline, yellow } from '../../../../../lib/picocolors'
import { findConfig } from '../../../../../lib/find-config'

type CssPluginCollection_Array = (string | [string, boolean | object])[]

type CssPluginCollection_Object = { [key: string]: object | boolean }

type CssPluginCollection =
  | CssPluginCollection_Array
  | CssPluginCollection_Object

type CssPluginShape = [string, object | boolean | string]

const genericErrorText = 'Malformed PostCSS Configuration'

function getError_NullConfig(pluginName: string) {
  return `${red(
    bold('Error')
  )}: Your PostCSS configuration for '${pluginName}' cannot have ${bold(
    'null'
  )} configuration.\nTo disable '${pluginName}', pass ${bold(
    'false'
  )}, otherwise, pass ${bold('true')} or a configuration object.`
}

function isIgnoredPlugin(pluginPath: string): boolean {
  const ignoredRegex =
    /(?:^|[\\/])(postcss-modules-values|postcss-modules-scope|postcss-modules-extract-imports|postcss-modules-local-by-default|postcss-modules)(?:[\\/]|$)/i
  const match = ignoredRegex.exec(pluginPath)
  if (match == null) {
    return false
  }

  const plugin = match.pop()!
  console.warn(
    `${yellow(bold('Warning'))}: Please remove the ${underline(
      plugin
    )} plugin from your PostCSS configuration. ` +
      `This plugin is automatically configured by Next.js.\n` +
      'Read more: https://nextjs.org/docs/messages/postcss-ignored-plugin'
  )
  return true
}

const createLazyPostCssPlugin = (
  fn: () => import('postcss').AcceptedPlugin
): import('postcss').AcceptedPlugin => {
  let result: any = undefined
  const plugin = (...args: any[]) => {
    if (result === undefined) result = fn() as any
    if (result.postcss === true) {
      return result(...args)
    } else if (result.postcss) {
      return result.postcss
    }
    return result
  }
  plugin.postcss = true
  return plugin
}

async function loadPlugin(
  dir: string,
  pluginName: string,
  options: boolean | object | string
): Promise<import('postcss').AcceptedPlugin | false> {
  if (options === false || isIgnoredPlugin(pluginName)) {
    return false
  }

  if (options == null) {
    console.error(getError_NullConfig(pluginName))
    throw new Error(genericErrorText)
  }

  const pluginPath = require.resolve(pluginName, { paths: [dir] })
  if (isIgnoredPlugin(pluginPath)) {
    return false
  } else if (options === true) {
    return createLazyPostCssPlugin(() => require(pluginPath))
  } else {
    if (typeof options === 'object' && Object.keys(options).length === 0) {
      return createLazyPostCssPlugin(() => require(pluginPath))
    }
    return createLazyPostCssPlugin(() => require(pluginPath)(options))
  }
}

function getDefaultPlugins(
  supportedBrowsers: string[] | undefined,
  disablePostcssPresetEnv: boolean
): any[] {
  return [
    require.resolve('next/dist/compiled/postcss-flexbugs-fixes'),
    disablePostcssPresetEnv
      ? false
      : [
          require.resolve('next/dist/compiled/postcss-preset-env'),
          {
            browsers: supportedBrowsers ?? ['defaults'],
            autoprefixer: {
              // Disable legacy flexbox support
              flexbox: 'no-2009',
            },
            // Enable CSS features that have shipped to the
            // web platform, i.e. in 2+ browsers unflagged.
            stage: 3,
            features: {
              'custom-properties': false,
            },
          },
        ],
  ].filter(Boolean)
}

export async function getPostCssPlugins(
  dir: string,
  supportedBrowsers: string[] | undefined,
  disablePostcssPresetEnv: boolean = false,
  useLightningcss: boolean = false
): Promise<import('postcss').AcceptedPlugin[]> {
  let config = await findConfig<{ plugins: CssPluginCollection }>(
    dir,
    'postcss'
  )

  if (config == null) {
    config = {
      plugins: useLightningcss
        ? []
        : getDefaultPlugins(supportedBrowsers, disablePostcssPresetEnv),
    }
  }

  if (typeof config === 'function') {
    throw new Error(
      `Your custom PostCSS configuration may not export a function. Please export a plain object instead.\n` +
        'Read more: https://nextjs.org/docs/messages/postcss-function'
    )
  }

  // Warn user about configuration keys which are not respected
  const invalidKey = Object.keys(config).find((key) => key !== 'plugins')
  if (invalidKey) {
    console.warn(
      `${yellow(
        bold('Warning')
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
  plugins.forEach((plugin) => {
    if (plugin == null) {
      console.warn(
        `${yellow(bold('Warning'))}: A ${bold(
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
        (typeof pluginConfig === 'boolean' ||
          typeof pluginConfig === 'object' ||
          typeof pluginConfig === 'string')
      ) {
        parsed.push([pluginName, pluginConfig])
      } else {
        if (typeof pluginName !== 'string') {
          console.error(
            `${red(
              bold('Error')
            )}: A PostCSS Plugin must be provided as a ${bold(
              'string'
            )}. Instead, we got: '${pluginName}'.\n` +
              'Read more: https://nextjs.org/docs/messages/postcss-shape'
          )
        } else {
          console.error(
            `${red(
              bold('Error')
            )}: A PostCSS Plugin was passed as an array but did not provide its configuration ('${pluginName}').\n` +
              'Read more: https://nextjs.org/docs/messages/postcss-shape'
          )
        }
        throw new Error(genericErrorText)
      }
    } else if (typeof plugin === 'function') {
      console.error(
        `${red(
          bold('Error')
        )}: A PostCSS Plugin was passed as a function using require(), but it must be provided as a ${bold(
          'string'
        )}.\nRead more: https://nextjs.org/docs/messages/postcss-shape`
      )
      throw new Error(genericErrorText)
    } else {
      console.error(
        `${red(
          bold('Error')
        )}: An unknown PostCSS plugin was provided (${plugin}).\n` +
          'Read more: https://nextjs.org/docs/messages/postcss-shape'
      )
      throw new Error(genericErrorText)
    }
  })

  const resolved = await Promise.all(
    parsed.map((p) => loadPlugin(dir, p[0], p[1]))
  )
  const filtered: import('postcss').AcceptedPlugin[] = resolved.filter(
    Boolean
  ) as import('postcss').AcceptedPlugin[]

  return filtered
}
