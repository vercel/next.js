const mdxLoader = require('@mdx-js/loader')
const { pathToFileURL } = require('node:url')

function interopDefault(mod) {
  return mod.default || mod
}

async function importPluginForPath(pluginPath, projectRoot) {
  const path = require.resolve(pluginPath, { paths: [projectRoot] })
  const importPath =
    process.platform === 'win32' ? pathToFileURL(path).href : path
  return interopDefault(
    // We intentionally resolve this at runtime in Node.js.
    // `webpackIgnore` avoids webpack build-deps analysis warnings for this loader file.
    await import(/* webpackIgnore: true */ importPath)
  )
}

async function importPlugin(plugin, projectRoot) {
  if (Array.isArray(plugin) && typeof plugin[0] === 'string') {
    plugin[0] = await importPluginForPath(plugin[0], projectRoot)
  }
  if (typeof plugin === 'string') {
    plugin = await importPluginForPath(plugin, projectRoot)
  }
  return plugin
}

async function getOptions(options, projectRoot) {
  const {
    recmaPlugins = [],
    rehypePlugins = [],
    remarkPlugins = [],
    ...rest
  } = options

  const [updatedRecma, updatedRehype, updatedRemark] = await Promise.all([
    Promise.all(
      recmaPlugins.map((plugin) => importPlugin(plugin, projectRoot))
    ),
    Promise.all(
      rehypePlugins.map((plugin) => importPlugin(plugin, projectRoot))
    ),
    Promise.all(
      remarkPlugins.map((plugin) => importPlugin(plugin, projectRoot))
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

  getOptions(options, this.context).then((userProvidedMdxOptions) => {
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
