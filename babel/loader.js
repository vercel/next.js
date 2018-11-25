import findCacheDir from 'find-cache-dir'

const babel = require('@babel/core')

const pkg = require('babel-loader/package.json')
const cache = require('babel-loader/lib/cache')
const transform = require('babel-loader/lib/transform')
const injectCaller = require('babel-loader/lib/injectCaller')

export default async function loader (filename, source, babelOptions) {
  const programmaticOptions = {
    filename,
    sourceMaps: 'inline',

    // Ensure that Webpack will get a full absolute path in the sourcemap
    // so that it can properly map the module back to its internal cached
    // modules.
    sourceFileName: filename,

    ...babelOptions,
    plugins: [
      require.resolve('./plugins/track-imports'),
      ...(babelOptions.plugins || [])
    ]
  }

  const config = babel.loadPartialConfig(injectCaller(programmaticOptions))
  if (config) {
    let options = config.options

    let result
    result = await cache({
      source,
      options,
      transform,
      cacheDirectory: findCacheDir({ name: 'babel-loader-next-server' }),
      cacheIdentifier: JSON.stringify({
        options,
        '@babel/core': transform.version,
        '@babel/loader': pkg.version
      }),
      cacheCompression: true
    })

    if (result) {
      const { code, metadata } = result

      return { code, metadata }
    }
  }

  // If the file was ignored, pass through the original content.
  return { code: source, metadata: {} }
}
