const mdxLoader = require('@mdx-js/loader')
const { pathToFileURL } = require('node:url')

function interopDefault(mod) {
  // Prefer the default export when present (covers CommonJS modules and ESM
  // packages whose plugin is the default export).
  if (mod.default) {
    return mod.default
  }
  // For ESM packages that expose the plugin as a named export rather than a
  // default export (https://github.com/vercel/next.js/issues/73757), fall back
  // to the first function-valued named export on the namespace object. Without
  // this the namespace object was returned and the plugin was silently dropped.
  for (const key of Object.keys(mod)) {
    if (key !== 'default' && typeof mod[key] === 'function') {
      return mod[key]
    }
  }
  return mod
}

async function importPluginForPath(pluginPath, projectRoot, resolve) {
  let resolvedPath
  try {
    resolvedPath = require.resolve(pluginPath, { paths: [projectRoot] })
  } catch (err) {
    // ESM-only packages whose "exports" map has no "require"/"default" condition
    // cannot be resolved by require.resolve() (it throws
    // ERR_PACKAGE_PATH_NOT_EXPORTED). Re-resolve through webpack's resolver,
    // which honours the "import" condition, scoped to the importing file's
    // directory. See https://github.com/vercel/next.js/issues/73757.
    if (err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' && resolve) {
      resolvedPath = await resolve(projectRoot, pluginPath)
    } else {
      throw err
    }
  }
  return interopDefault(
    // "use pathToFileUrl to make esm import()s work with absolute windows paths":
    // on windows import("C:\\path\\to\\file") is not valid, so we need to use file:// URLs
    // https://github.com/vercel/next.js/commit/fbf9e12de095e0237d4ba4aa6139d9757bd20be9
    await import(
      process.platform === 'win32' ? pathToFileURL(resolvedPath) : resolvedPath
    )
  )
}

async function importPlugin(plugin, projectRoot, resolve) {
  if (Array.isArray(plugin) && typeof plugin[0] === 'string') {
    plugin[0] = await importPluginForPath(plugin[0], projectRoot, resolve)
  }
  if (typeof plugin === 'string') {
    plugin = await importPluginForPath(plugin, projectRoot, resolve)
  }
  return plugin
}

async function getOptions(options, projectRoot, resolve) {
  const {
    recmaPlugins = [],
    rehypePlugins = [],
    remarkPlugins = [],
    ...rest
  } = options

  const [updatedRecma, updatedRehype, updatedRemark] = await Promise.all([
    Promise.all(
      recmaPlugins.map((plugin) => importPlugin(plugin, projectRoot, resolve))
    ),
    Promise.all(
      rehypePlugins.map((plugin) => importPlugin(plugin, projectRoot, resolve))
    ),
    Promise.all(
      remarkPlugins.map((plugin) => importPlugin(plugin, projectRoot, resolve))
    ),
  ])

  return {
    ...rest,
    recmaPlugins: updatedRecma,
    rehypePlugins: updatedRehype,
    remarkPlugins: updatedRemark,
  }
}

module.exports = function nextMdxLoader(...args) {
  const options = this.getOptions()
  const callback = this.async().bind(this)
  const loaderContext = this

  // webpack resolver scoped to the importing file's directory, honouring the
  // ESM "import" condition so import-only ESM plugin packages can be resolved.
  const resolve = this.getResolve({
    conditionNames: ['import', 'node', 'require', 'default'],
    extensions: ['.js', '.mjs', '.cjs'],
  })

  getOptions(options, this.context, resolve).then((userProvidedMdxOptions) => {
    const proxy = new Proxy(loaderContext, {
      get(target, prop, receiver) {
        if (prop === 'getOptions') {
          return () => userProvidedMdxOptions
        }

        if (prop === 'async') {
          return () => callback
        }

        return Reflect.get(target, prop, receiver)
      },
    })

    mdxLoader.call(proxy, ...args)
  })
}

// Exported for unit testing of plugin resolution (see
// test/unit/next-mdx-plugin-resolution.test.ts). Webpack only invokes the
// default callable export, so attaching these is side-effect free.
module.exports.interopDefault = interopDefault
module.exports.importPluginForPath = importPluginForPath
