import path from 'path'
import loadConfig from '../server/config'
import { NextConfig } from '../server/config-shared'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'

const supportedTurbopackNextConfigOptions = [
  'configFileName',
  'env',
  'basePath',
  'modularizeImports',
  'compiler.emotion',
  'compiler.relay',
  'compiler.styledComponents',
  'images',
  'pageExtensions',
  'onDemandEntries',
  'rewrites',
  'redirects',
  'headers',
  'reactStrictMode',
  'swcMinify',
  'transpilePackages',
  'trailingSlash',
  'i18n.locales',
  'i18n.defaultLocale',
  'sassOptions',
  'configOrigin',
  'httpAgentOptions',
  'useFileSystemPublicRoutes',
  'generateEtags',
  'assetPrefix',
  'experimental.serverComponentsExternalPackages',
  'experimental.turbo',
  'experimental.mdxRs',
  'experimental.forceSwcTransforms',
  'experimental.serverActionsBodySizeLimit',
  'experimental.memoryBasedWorkersCount',
  // options below are not really supported, but ignored
  'webpack',
  'devIndicators',
  'onDemandEntries',
  'excludeDefaultMomentLocales',
  'experimental.cpus',
  'experimental.sharedPool',
  'experimental.proxyTimeout',
  'experimental.isrFlushToDisk',
  'experimental.workerThreads',
  'experimental.caseSensitiveRoutes',
  'experimental.optimizePackageImports',
  'experimental.optimizeServerReact',
]

// The following will need to be supported by `next build --turbo`
const prodSpecificTurboNextConfigOptions = [
  'eslint',
  'typescript',
  'staticPageGenerationTimeout',
  'outputFileTracing',
  'output',
  'generateBuildId',
  'analyticsId',
  'compress',
  'productionBrowserSourceMaps',
  'optimizeFonts',
  'poweredByHeader',
  'staticPageGenerationTimeout',
  'reactProductionProfiling',
  'cleanDistDir',
  'compiler.reactRemoveProperties',
  'compiler.removeConsole',
  'experimental.turbotrace',
  'experimental.outputFileTracingRoot',
  'experimental.outputFileTracingExcludes',
  'experimental.outputFileTracingIgnores',
  'experiemental.outputFileTracingIncludes',
  'experimental.gzipSize',
  'experimental.useDeploymentId',
  'experimental.useDeploymentIdServerActions',
  'experimental.deploymentId',
  'experimental.serverMinification',
  'experimental.serverSourceMaps',
  'experimenta.trustHostHeader',
]

// check for babelrc, swc plugins
export async function validateTurboNextConfig({
  dir,
  isDev,
}: {
  allowRetry?: boolean
  dir: string
  port: number
  hostname?: string
  isDev?: boolean
}) {
  const { getPkgManager } =
    require('../lib/helpers/get-pkg-manager') as typeof import('../lib/helpers/get-pkg-manager')
  const { getBabelConfigFile } =
    require('../build/get-babel-config-file') as typeof import('../build/get-babel-config-file')
  const { defaultConfig } =
    require('../server/config-shared') as typeof import('../server/config-shared')
  const chalk =
    require('next/dist/compiled/chalk') as typeof import('next/dist/compiled/chalk')
  const { interopDefault } =
    require('../lib/interop-default') as typeof import('../lib/interop-default')

  // To regenerate the TURBOPACK gradient require('gradient-string')('blue', 'red')('>>> TURBOPACK')
  const isTTY = process.stdout.isTTY

  const turbopackGradient = `${chalk.bold(
    isTTY
      ? '\x1B[38;2;0;0;255m>\x1B[39m\x1B[38;2;23;0;232m>\x1B[39m\x1B[38;2;46;0;209m>\x1B[39m \x1B[38;2;70;0;185mT\x1B[39m\x1B[38;2;93;0;162mU\x1B[39m\x1B[38;2;116;0;139mR\x1B[39m\x1B[38;2;139;0;116mB\x1B[39m\x1B[38;2;162;0;93mO\x1B[39m\x1B[38;2;185;0;70mP\x1B[39m\x1B[38;2;209;0;46mA\x1B[39m\x1B[38;2;232;0;23mC\x1B[39m\x1B[38;2;255;0;0mK\x1B[39m'
      : '>>> TURBOPACK'
  )} ${chalk.dim('(beta)')}\n\n`

  let thankYouMessage =
    [
      'Thank you for trying Next.js v13 with Turbopack! As a reminder',
      'Turbopack is currently in beta and not yet ready for production.',
      'We appreciate your ongoing support as we work to make it ready',
      'for everyone.',
    ].join('\n') + '\n\n'

  let unsupportedParts = ''
  let babelrc = await getBabelConfigFile(dir)
  if (babelrc) babelrc = path.basename(babelrc)

  let hasWebpack = false
  let hasTurbo = false

  let unsupportedConfig: string[] = []
  let rawNextConfig: NextConfig = {}

  try {
    rawNextConfig = interopDefault(
      await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, {
        rawConfig: true,
      })
    ) as NextConfig

    if (typeof rawNextConfig === 'function') {
      rawNextConfig = (rawNextConfig as any)(PHASE_DEVELOPMENT_SERVER, {
        defaultConfig,
      })
    }

    const flattenKeys = (obj: any, prefix: string = ''): string[] => {
      let keys: string[] = []

      for (const key in obj) {
        if (typeof obj?.[key] === 'undefined') {
          continue
        }

        const pre = prefix.length ? `${prefix}.` : ''

        if (
          typeof obj[key] === 'object' &&
          !Array.isArray(obj[key]) &&
          obj[key] !== null
        ) {
          keys = keys.concat(flattenKeys(obj[key], pre + key))
        } else {
          keys.push(pre + key)
        }
      }

      return keys
    }

    const getDeepValue = (obj: any, keys: string | string[]): any => {
      if (typeof keys === 'string') {
        keys = keys.split('.')
      }
      if (keys.length === 1) {
        return obj?.[keys?.[0]]
      }
      return getDeepValue(obj?.[keys?.[0]], keys.slice(1))
    }

    const customKeys = flattenKeys(rawNextConfig)

    let supportedKeys = isDev
      ? [
          ...supportedTurbopackNextConfigOptions,
          ...prodSpecificTurboNextConfigOptions,
        ]
      : supportedTurbopackNextConfigOptions

    for (const key of customKeys) {
      if (key.startsWith('webpack')) {
        hasWebpack = true
      }
      if (key.startsWith('experimental.turbo')) {
        hasTurbo = true
      }

      let isSupported =
        supportedKeys.some((supportedKey) => key.startsWith(supportedKey)) ||
        getDeepValue(rawNextConfig, key) === getDeepValue(defaultConfig, key)
      if (!isSupported) {
        unsupportedConfig.push(key)
      }
    }
  } catch (e) {
    console.error('Unexpected error occurred while checking config', e)
  }

  const hasWarningOrError = babelrc || unsupportedConfig.length
  if (!hasWarningOrError) {
    thankYouMessage = chalk.dim(thankYouMessage)
  }
  console.log(turbopackGradient + thankYouMessage)

  let feedbackMessage = `Learn more about Next.js v13 and Turbopack: ${chalk.underline(
    'https://nextjs.link/with-turbopack'
  )}\n`

  if (hasWebpack && !hasTurbo) {
    console.warn(
      `\n${chalk.yellow(
        'Warning:'
      )} Webpack is configured while Turbopack is not, which may cause problems.\n
  ${`See instructions if you need to configure Turbopack:\n  https://turbo.build/pack/docs/features/customizing-turbopack\n`}`
    )
  }

  if (babelrc) {
    unsupportedParts += `\n- Babel detected (${chalk.cyan(
      babelrc
    )})\n  Babel is not yet supported. To use Turbopack at the moment,\n  you'll need to remove your usage of Babel.`
  }

  if (
    unsupportedConfig.length === 1 &&
    unsupportedConfig[0] === 'experimental.optimizePackageImports'
  ) {
    console.warn(
      `\n${chalk.yellow('Warning:')} ${chalk.cyan(
        'experimental.optimizePackageImports'
      )} is not yet supported by Turbopack and will be ignored.`
    )
  } else if (unsupportedConfig.length) {
    unsupportedParts += `\n\n- Unsupported Next.js configuration option(s) (${chalk.cyan(
      'next.config.js'
    )})\n  To use Turbopack, remove the following configuration options:\n${unsupportedConfig
      .map((name) => `    - ${chalk.red(name)}\n`)
      .join('')}`
  }

  if (unsupportedParts) {
    const pkgManager = getPkgManager(dir)

    console.error(
      `Error: You are using configuration and/or tools that are not yet\nsupported by Next.js v13 with Turbopack:\n${unsupportedParts}\n
If you cannot make the changes above, but still want to try out\nNext.js v13 with Turbopack, create the Next.js v13 playground app\nby running the following commands:

  ${chalk.bold.cyan(
    `${
      pkgManager === 'npm'
        ? 'npx create-next-app'
        : `${pkgManager} create next-app`
    } --example with-turbopack with-turbopack-app`
  )}\n  cd with-turbopack-app\n  ${pkgManager} run dev
        `
    )

    console.warn(feedbackMessage)

    process.exit(1)
  }

  console.log(feedbackMessage)

  return rawNextConfig
}
