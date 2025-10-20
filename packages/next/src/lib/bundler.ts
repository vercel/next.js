/// Utilties for configuring the bundler to use.
export enum Bundler {
  Turbopack,
  Webpack,
  Rspack,
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
}): Bundler {
  const bundlerFlags = new Map<Bundler, string[]>()
  const setBundlerFlag = (bundler: Bundler, flag: string) => {
    bundlerFlags.set(bundler, (bundlerFlags.get(bundler) ?? []).concat(flag))
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
    setBundlerFlag(Bundler.Turbopack, `TURBOPACK=${process.env.TURBOPACK}`)
  } else if (process.env.IS_TURBOPACK_TEST) {
    setBundlerFlag(
      Bundler.Turbopack,
      `IS_TURBOPACK_TEST=${process.env.IS_TURBOPACK_TEST}`
    )
  }
  if (options.webpack) {
    setBundlerFlag(Bundler.Webpack, '--webpack')
  }

  if (process.env.IS_WEBPACK_TEST) {
    setBundlerFlag(
      Bundler.Webpack,
      `IS_WEBPACK_TEST=${process.env.IS_WEBPACK_TEST}`
    )
  }

  // Mostly this is set via the NextConfig but it can also be set via the command line which is
  // common for testing.
  if (process.env.NEXT_RSPACK) {
    setBundlerFlag(Bundler.Rspack, `NEXT_RSPACK=${process.env.NEXT_RSPACK}`)
  }
  if (process.env.NEXT_TEST_USE_RSPACK) {
    setBundlerFlag(
      Bundler.Rspack,
      `NEXT_TEST_USE_RSPACK=${process.env.NEXT_TEST_USE_RSPACK}`
    )
  }

  if (bundlerFlags.size > 1) {
    console.error(
      `Multiple bundler flags set: ${Array.from(bundlerFlags.values()).flat().join(', ')}.

Edit your command or your package.json script to configure only one bundler.`
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

/**
 * Finalize the bundler based on the config.
 *
 * Rspack is configured via next config by setting an environment variable (yay, side effects)
 * so this should only be called after parsing the config.
 */
export function finalizeBundlerFromConfig(fromOptions: Bundler) {
  // Reading the next config can set NEXT_RSPACK environment variables.
  if (process.env.NEXT_RSPACK) {
    return Bundler.Rspack
  }
  return fromOptions
}
