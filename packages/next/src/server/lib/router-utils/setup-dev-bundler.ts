import type { DevBundler, SetupOpts } from './dev-bundler-types'

export async function setupDevBundler(opts: SetupOpts): Promise<DevBundler> {
  if (opts.turbo) {
    const { setupDevBundlerTurbopack } =
      require('./setup-dev-bundler-turbopack') as typeof import('./setup-dev-bundler-turbopack')
    return setupDevBundlerTurbopack(opts)
  }

  const { setupDevBundlerWebpack } =
    require('./setup-dev-bundler-webpack') as typeof import('./setup-dev-bundler-webpack')
  return setupDevBundlerWebpack(opts)
}
