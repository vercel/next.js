const mdxLoader = require('@mdx-js/loader')
const { pathToFileURL } = require('node:url')

function interopDefault(mod) {
  return mod.default || mod
}

async function importPluginForPath(pluginPath, projectRoot) {
  const path = require.resolve(pluginPath, { paths: [projectRoot] })
  return interopDefault(
    // "use pathToFileUrl to make esm import()s work with absolute windows paths":
    // on windows import("C:\\path\\to\\file") is not valid, so we need to use file:// URLs
    // https://github.com/vercel/next.js/commit/fbf9e12de095e0237d4ba4aa6139d9757bd20be9
    await import(process.platform === 'win32' ? pathToFileURL(path) : path)
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
