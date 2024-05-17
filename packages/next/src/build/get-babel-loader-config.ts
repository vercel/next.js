import path from 'path'
import type { ReactCompilerOptions } from '../server/config-shared'

function getReactCompiler() {
  try {
    // It's in peerDependencies, so it should be available
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require.resolve('babel-plugin-react-compiler')
  } catch {
    throw new Error(
      'Failed to load the `babel-plugin-react-compiler`. It is required to use the React Compiler. Please install it.'
    )
  }
}

const getReactCompilerPlugins = (
  options: boolean | ReactCompilerOptions | undefined,
  isDev: boolean,
  isServer: boolean
) => {
  if (!options || isServer) {
    return undefined
  }

  const compilerOptions = typeof options === 'boolean' ? {} : options
  if (options) {
    return [
      [
        getReactCompiler(),
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
  reactCompilerOptions: boolean | ReactCompilerOptions | undefined,
  reactCompilerExclude: ((excludePath: string) => boolean) | undefined
) => {
  if (!useSWCLoader) {
    return {
      loader: require.resolve('./babel/loader/index'),
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
        reactCompilerPlugins: getReactCompilerPlugins(
          reactCompilerOptions,
          dev,
          isServer
        ),
        reactCompilerExclude,
      },
    }
  }

  return undefined
}

/**
 * Get a separate babel loader for the react compiler, only used if Babel is not
 * configured through e.g. .babelrc. If user have babel config, this should be configured in the babel loader itself.
 * Note from react compiler:
 * > For best results, compiler must run as the first plugin in your Babel pipeline so it receives input as close to the original source as possible.
 */
const getReactCompilerLoader = (
  options: boolean | ReactCompilerOptions | undefined,
  cwd: string,
  isDev: boolean,
  isServer: boolean,
  reactCompilerExclude: ((excludePath: string) => boolean) | undefined
) => {
  const reactCompilerPlugins = getReactCompilerPlugins(options, isDev, isServer)
  if (!reactCompilerPlugins) {
    return undefined
  }

  const config: any = {
    loader: require.resolve('./babel/loader/index'),
    options: {
      transformMode: 'standalone',
      cwd,
      reactCompilerPlugins,
    },
  }

  if (reactCompilerExclude) {
    config.options.reactCompilerExclude = reactCompilerExclude
  }

  return config
}

export { getBabelLoader, getReactCompilerLoader }
