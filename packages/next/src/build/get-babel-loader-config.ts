import path from 'path'
import type { ReactCompilerOptions } from '../server/config-shared'

const getReactCompilerPlugins = (
  options: boolean | ReactCompilerOptions | undefined,
  isDev: boolean
) => {
  if (!options) {
    return undefined
  }

  const compilerOptions = typeof options === 'boolean' ? {} : options
  if (options) {
    return [
      [
        'babel-plugin-react-compiler',
        {
          panicThreshold: isDev ? undefined : 'NONE',
          ...compilerOptions,
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
  reactCompilerOptions: boolean | ReactCompilerOptions | undefined
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
        srcDir: path.dirname(srcDir),
        development: dev,
        hasReactRefresh: dev && isClient,
        hasJsxRuntime: true,
        plugins: getReactCompilerPlugins(reactCompilerOptions, dev),
      },
    }
  }

  return undefined
}

/**
 * Get a separate babel loader for the react compiler, **if** there aren't babel loader
 * configured. If user have babel config, this should be configured in the babel loader itself.
 * Note from react compiler:
 * > For best results, compiler must run as the first plugin in your Babel pipeline so it receives input as close to the original source as possible.
 */
const getReactCompilerLoader = (
  options: boolean | ReactCompilerOptions | undefined,
  cwd: string,
  isDev: boolean
) => {
  if (!options) {
    return undefined
  }

  return {
    loader: 'next/dist/build/babel/loader',
    options: {
      transformMode: 'standalone',
      cwd,
      plugins: getReactCompilerPlugins(options, isDev),
    },
  }
}

export { getBabelLoader, getReactCompilerLoader }
