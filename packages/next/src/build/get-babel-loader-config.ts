import type { EnvironmentConfig } from 'babel-plugin-react-compiler'
import path from 'path'
import type { JSONValue, ReactCompilerOptions } from '../server/config-shared'
import type { NextBabelLoaderOptions } from './babel/loader/types'

function getReactCompiler() {
  try {
    return require.resolve('babel-plugin-react-compiler')
  } catch {
    throw new Error(
      'Failed to load the `babel-plugin-react-compiler`. It is required to use the React Compiler. Please install it.'
    )
  }
}

const getReactCompilerPlugins = (
  maybeOptions: boolean | ReactCompilerOptions | undefined,
  isServer: boolean,
  isDev: boolean,
  cwd: string
): undefined | JSONValue[] => {
  if (!maybeOptions || isServer) {
    return undefined
  }

  // Set the React Compiler target based on the installed React version.
  // Handle only the supported versions.
  // https://react.dev/reference/react-compiler/target
  let target: '18' | undefined
  try {
    const reactPkgPath = require.resolve('react/package.json', {
      paths: [cwd],
    })
    const majorVersion: string = require(reactPkgPath).version.split('.')[0]
    if (majorVersion === '18') {
      target = majorVersion
    }
  } catch {
    // react/package.json not resolvable — skip target detection
  }

  const environment: Pick<EnvironmentConfig, 'enableNameAnonymousFunctions'> = {
    enableNameAnonymousFunctions: isDev,
  }
  const options: ReactCompilerOptions =
    typeof maybeOptions === 'boolean' ? {} : maybeOptions
  const compilerOptions: JSONValue = {
    ...options,
    ...(target ? { target } : {}),
    environment,
  }
  return [[getReactCompiler(), compilerOptions]]
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
    // Make sure these options are kept in sync with
    // `packages/next/src/build/get-babel-loader-config.ts`
    const options: NextBabelLoaderOptions = {
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
        isServer,
        dev,
        cwd
      ),
      reactCompilerExclude,
    }
    return {
      loader: require.resolve('./babel/loader/index'),
      options,
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
  reactCompilerOptions: boolean | ReactCompilerOptions | undefined,
  cwd: string,
  isServer: boolean,
  reactCompilerExclude: ((excludePath: string) => boolean) | undefined,
  isDev: boolean
) => {
  const reactCompilerPlugins = getReactCompilerPlugins(
    reactCompilerOptions,
    isServer,
    isDev,
    cwd
  )
  if (!reactCompilerPlugins) {
    return undefined
  }

  const babelLoaderOptions: NextBabelLoaderOptions = {
    transformMode: 'standalone',
    cwd,
    reactCompilerPlugins,
    isServer,
  }
  if (reactCompilerExclude) {
    babelLoaderOptions.reactCompilerExclude = reactCompilerExclude
  }

  return {
    loader: require.resolve('./babel/loader/index'),
    options: babelLoaderOptions,
  }
}

export { getBabelLoader, getReactCompilerLoader }
