const mdxLoader = require('@mdx-js/loader')

function interopDefault(mod) {
  return mod.default || mod
}

async function importPlugin(plugin) {
  if (Array.isArray(plugin) && typeof plugin[0] === 'string') {
    plugin[0] = interopDefault(await import(plugin[0]))
  }
  return plugin
}

async function getOptions(options) {
  const {
    recmaPlugins = [],
    rehypePlugins = [],
    remarkPlugins = [],
    ...rest
  } = options

  const [updatedRecma, updatedRehype, updatedRemark] = await Promise.all([
    Promise.all(recmaPlugins.map(importPlugin)),
    Promise.all(rehypePlugins.map(importPlugin)),
    Promise.all(remarkPlugins.map(importPlugin)),
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

  getOptions(options).then((userProvidedMdxOptions) => {
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
