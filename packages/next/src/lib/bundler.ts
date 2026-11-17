import * as Log from '../build/output/log'

/// Utilties for configuring the bundler to use.
export enum Bundler {
  Turbopack,
  Webpack,
  Rspack,
}

export function bundlerName(bundler: Bundler): string {
  switch (bundler) {
    case Bundler.Turbopack:
      return 'Turbopack'
    case Bundler.Webpack:
      return 'webpack'
    case Bundler.Rspack:
      return 'Rspack'
  }
}

/**
 * Derive the currently configured bundler from the environment.
 */
export function getBundlerFromEnv(): Bundler {
  if (process.env.NEXT_RSPACK) {
    return Bundler.Rspack
  }
  if (process.env.TURBOPACK) {
    return Bundler.Turbopack
  }
  return Bundler.Webpack
}
/**
 * Parse the bundler arguments and potentially sets the `TURBOPACK` environment variable.
 *
 * NOTE: rspack is configured via next config which is chaotic so it is possible for this to be overridden later.
 *
 * @param options The options to parse.
 * @returns The bundler that was configured
 */
export function parseBundlerArgs(options: {
  turbo?: boolean
  turbopack?: boolean
  webpack?: boolean
  customWebpack?: boolean
}): Bundler {
  // The CLI flags and environment variables that selected each bundler, in the order they were
  // checked. Environment variables are tracked separately so the conflict error can point users to
  // them: they are easy to miss since they don't appear in the command.
  const bundlerFlags = new Map<Bundler, BundlerFlag[]>()
  const setBundlerFlag = (bundler: Bundler, flag: string) => {
    bundlerFlags.set(
      bundler,
      (bundlerFlags.get(bundler) ?? []).concat({ kind: 'flag', flag })
    )
  }
  const setBundlerEnv = (bundler: Bundler, name: string) => {
    bundlerFlags.set(
      bundler,
      (bundlerFlags.get(bundler) ?? []).concat({
        kind: 'env',
        name,
        value: process.env[name] ?? '',
      })
    )
  }
  // What turbo flag was set? We allow multiple to be set, which is silly but not ambiguous, just pick the most relevant one.
  if (options.turbopack) {
    setBundlerFlag(Bundler.Turbopack, '--turbopack')
  }
  if (options.turbo) {
    setBundlerFlag(Bundler.Turbopack, '--turbo')
  } else if (process.env.TURBOPACK) {
    // We don't really want to support this but it is trivial and not really confusing.
    // If we don't support it and someone sets it, we would have inconsistent behavior
    // since some parts of next would read the return value of this function and other
    // parts will read the env variable.
    setBundlerEnv(Bundler.Turbopack, 'TURBOPACK')
  } else if (process.env.IS_TURBOPACK_TEST) {
    setBundlerEnv(Bundler.Turbopack, 'IS_TURBOPACK_TEST')
  }
  if (options.webpack) {
    setBundlerFlag(Bundler.Webpack, '--webpack')
  }
  if (options.customWebpack) {
    setBundlerFlag(Bundler.Webpack, '--custom-webpack')
  }

  if (process.env.IS_WEBPACK_TEST) {
    setBundlerEnv(Bundler.Webpack, 'IS_WEBPACK_TEST')
  }

  // Mostly this is set via the NextConfig but it can also be set via the command line which is
  // common for testing.
  if (process.env.NEXT_RSPACK) {
    setBundlerEnv(Bundler.Rspack, 'NEXT_RSPACK')
  }
  if (process.env.NEXT_TEST_USE_RSPACK) {
    setBundlerEnv(Bundler.Rspack, 'NEXT_TEST_USE_RSPACK')
  }

  if (
    bundlerFlags.size > 1 ||
    (options.webpack === true && options.customWebpack === true)
  ) {
    console.error(
      formatMultipleBundlersError(Array.from(bundlerFlags.values()).flat())
    )
    process.exit(1)
  }
  // The default is turbopack when nothing is configured.
  if (bundlerFlags.size === 0) {
    process.env.TURBOPACK = 'auto'
    return Bundler.Turbopack
  }
  if (bundlerFlags.has(Bundler.Turbopack)) {
    // Only conditionally assign to the environment variable, preserving already set values.
    // If it was set to 'auto' because no flag was set and this function is called a second time we
    // would upgrade to '1' but we don't really want that.
    process.env.TURBOPACK ??= '1'
    return Bundler.Turbopack
  }
  // Otherwise it is one of rspack or webpack. At this point there must be exactly one key in the map.
  return bundlerFlags.keys().next().value!
}

type BundlerFlag =
  | { kind: 'flag'; flag: string }
  | { kind: 'env'; name: string; value: string }

function formatMultipleBundlersError(flags: BundlerFlag[]): string {
  const sources = flags.map((f) =>
    f.kind === 'flag'
      ? `${f.flag} (CLI flag)`
      : `${f.name}=${f.value} (environment variable)`
  )
  const envNames = flags.flatMap((f) => (f.kind === 'env' ? [f.name] : []))

  const fixes: string[] = []
  if (flags.some((f) => f.kind === 'flag')) {
    fixes.push('edit your command or your package.json script')
  }
  if (envNames.length === 1) {
    fixes.push(`unset the ${envNames[0]} environment variable`)
  } else if (envNames.length > 1) {
    fixes.push(
      `unset the conflicting environment variables (${envNames.join(', ')})`
    )
  }

  return `Multiple bundler flags set: ${sources.join(', ')}.

To configure only one bundler, ${fixes.join(', or ')}.`
}

/**
 * Finalize the bundler based on the config.
 *
 * Rspack is configured via next config by setting an environment variable (yay, side effects)
 * so this should only be called after parsing the config.
 */
export function finalizeBundlerFromConfig(fromOptions: Bundler) {
  // Reading the next config can set NEXT_RSPACK environment variables.
  if (process.env.NEXT_RSPACK) {
    if (fromOptions !== Bundler.Rspack) {
      Log.event(
        `Switching bundler from ${bundlerName(fromOptions)} to Rspack based on config`
      )
    }
    return Bundler.Rspack
  }
  return fromOptions
}
