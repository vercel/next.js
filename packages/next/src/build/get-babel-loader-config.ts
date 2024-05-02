import type { ForgetCompilerOptions } from '../server/config-shared'

const getForgetCompilerPlugins = (
  options: ForgetCompilerOptions | undefined,
  isDev: boolean
) => {
  if (options) {
    return [
      [
        'react-forget/dist/babel-plugin-react-forget',
        {
          panicThreshold: isDev ? undefined : 'NONE',
          ...options,
        },
      ],
    ]
  }
  return undefined
}

const getBabelLoader = (
  useSWCLoader: boolean | undefined,
  babelConfigFile: string | undefined,
  isServer: boolean,
  distDir: string,
  pagesDir: string | undefined,
  cwd: string,
  srcDir: string,
  dev: boolean,
  isClient: boolean,
  forgetCompilerOptions: ForgetCompilerOptions | undefined
) => {
  if (!useSWCLoader) {
    return {
      loader: 'next/dist/build/babel/loader',
      options: {
        transformMode: 'default',
        configFile: babelConfigFile,
        isServer,
        distDir,
        pagesDir,
        cwd,
        srcDir,
        development: dev,
        hasReactRefresh: dev && isClient,
        hasJsxRuntime: true,
        plugins: getForgetCompilerPlugins(forgetCompilerOptions, dev),
      },
    }
  }

  return undefined
}

/**
 * Get a separate babel loader for the forget compiler, **if** there aren't babel loader
 * configured. If user have babel config, this should be configured in the babel loader itself.
 * Note from forget compiler:
 * > For best results, Forget must run as the first plugin in your Babel pipeline so it receives input as close to the original source as possible.
 */
const getForgetCompilerLoader = (
  options: ForgetCompilerOptions | undefined,
  cwd: string,
  isDev: boolean
) => {
  return {
    loader: 'next/dist/build/babel/loader',
    options: {
      transformMode: 'standalone',
      cwd,
      plugins: getForgetCompilerPlugins(options, isDev),
    },
  }
}

export { getBabelLoader, getForgetCompilerLoader }
