import path from 'path'
import loadConfig from '../server/config'
import { NextConfig } from '../server/config-shared'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'

const supportedTurbopackNextConfigOptions = [
  'configFileName',
  'env',
  'experimental.appDir',
  'compiler.emotion',
  'experimental.serverComponentsExternalPackages',
  'experimental.turbo',
  'images',
  'pageExtensions',
  'onDemandEntries',
  'rewrites',
  'redirects',
  'headers',
  'reactStrictMode',
  'swcMinify',
  'transpilePackages',
]

// check for babelrc, swc plugins
export async function validateTurboNextConfig({
  dir,
  isCustomTurbopack,
}: {
  allowRetry?: boolean
  isCustomTurbopack?: boolean
  dir: string
  port: number
  hostname?: string
}) {
  const { getPkgManager } =
    require('../lib/helpers/get-pkg-manager') as typeof import('../lib/helpers/get-pkg-manager')
  const { getBabelConfigFile } =
    require('../build/webpack-config') as typeof import('../build/webpack-config')
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
  )} ${chalk.dim('(alpha)')}\n\n`

  let thankYouMsg = `Thank you for trying Next.js v13 with Turbopack! As a reminder,\nTurbopack is currently in alpha and not yet ready for production.\nWe appreciate your ongoing support as we work to make it ready\nfor everyone.\n`

  let unsupportedParts = ''
  let babelrc = await getBabelConfigFile(dir)
  if (babelrc) babelrc = path.basename(babelrc)

  let unsupportedConfig: string[] = []
  let rawNextConfig: NextConfig = {}

  try {
    rawNextConfig = interopDefault(
      await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, undefined, true)
    ) as NextConfig

    if (typeof rawNextConfig === 'function') {
      rawNextConfig = (rawNextConfig as any)(PHASE_DEVELOPMENT_SERVER, {
        defaultConfig,
      })
    }

    const checkUnsupportedCustomConfig = (
      configKey = '',
      parentUserConfig: any,
      parentDefaultConfig: any
    ): boolean => {
      try {
        // these should not error
        if (
          // we only want the key after the dot for experimental options
          supportedTurbopackNextConfigOptions
            .map((key) => key.split('.').splice(-1)[0])
            .includes(configKey)
        ) {
          return false
        }

        // experimental options are checked separately
        if (configKey === 'experimental') {
          return false
        }

        let userValue = parentUserConfig?.[configKey]
        let defaultValue = parentDefaultConfig?.[configKey]

        if (typeof defaultValue !== 'object') {
          return defaultValue !== userValue
        }
        return Object.keys(userValue || {}).some((key: string) => {
          return checkUnsupportedCustomConfig(key, userValue, defaultValue)
        })
      } catch (e) {
        console.error(
          `Unexpected error occurred while checking ${configKey}`,
          e
        )
        return false
      }
    }

    unsupportedConfig = [
      ...Object.keys(rawNextConfig).filter((key) =>
        checkUnsupportedCustomConfig(key, rawNextConfig, defaultConfig)
      ),
      ...Object.keys(rawNextConfig.experimental ?? {})
        .filter((key) =>
          checkUnsupportedCustomConfig(
            key,
            rawNextConfig?.experimental,
            defaultConfig?.experimental
          )
        )
        .map((key) => `experimental.${key}`),
    ]
  } catch (e) {
    console.error('Unexpected error occurred while checking config', e)
  }

  const hasWarningOrError = babelrc || unsupportedConfig.length
  if (!hasWarningOrError) {
    thankYouMsg = chalk.dim(thankYouMsg)
  }
  if (!isCustomTurbopack) {
    console.log(turbopackGradient + thankYouMsg)
  }

  let feedbackMessage = `Learn more about Next.js v13 and Turbopack: ${chalk.underline(
    'https://nextjs.link/with-turbopack'
  )}\nPlease direct feedback to: ${chalk.underline(
    'https://nextjs.link/turbopack-feedback'
  )}\n`

  if (!hasWarningOrError) {
    feedbackMessage = chalk.dim(feedbackMessage)
  }

  if (babelrc) {
    unsupportedParts += `\n- Babel detected (${chalk.cyan(
      babelrc
    )})\n  ${chalk.dim(
      `Babel is not yet supported. To use Turbopack at the moment,\n  you'll need to remove your usage of Babel.`
    )}`
  }
  if (unsupportedConfig.length) {
    unsupportedParts += `\n\n- Unsupported Next.js configuration option(s) (${chalk.cyan(
      'next.config.js'
    )})\n  ${chalk.dim(
      `To use Turbopack, remove the following configuration options:\n${unsupportedConfig
        .map((name) => `    - ${chalk.red(name)}\n`)
        .join(
          ''
        )}  The only supported configurations options are:\n${supportedTurbopackNextConfigOptions
        .map((name) => `    - ${chalk.cyan(name)}\n`)
        .join('')}  `
    )}   `
  }

  if (unsupportedParts && !isCustomTurbopack) {
    const pkgManager = getPkgManager(dir)

    console.error(
      `${chalk.bold.red(
        'Error:'
      )} You are using configuration and/or tools that are not yet\nsupported by Next.js v13 with Turbopack:\n${unsupportedParts}\n
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

    if (!isCustomTurbopack) {
      console.warn(feedbackMessage)

      process.exit(1)
    } else {
      console.warn(
        `\n${chalk.bold.yellow(
          'Warning:'
        )} Unsupported config found; but continuing with custom Turbopack binary.\n`
      )
    }
  }

  if (!isCustomTurbopack) {
    console.log(feedbackMessage)
  }

  return rawNextConfig
}
