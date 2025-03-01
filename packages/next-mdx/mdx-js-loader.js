const mdxLoader = require('@mdx-js/loader')

function interopDefault(mod) {
  return mod.default || mod
}

async function importPlugin(plugin, projectRoot) {
  if (Array.isArray(plugin) && typeof plugin[0] === 'string') {
    plugin[0] = interopDefault(
      await import(require.resolve(plugin[0], { paths: [projectRoot] }))
    )
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
