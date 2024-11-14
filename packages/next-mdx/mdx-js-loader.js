const mdxLoader = require('@mdx-js/loader')

function interopDefault(mod) {
  return mod.default || mod
}

module.exports = async function nextMdxLoader(...args) {
  const options = this.getOptions()
  const userProvidedMdxOptions = { ...options }

  for (const recmaPlugin of userProvidedMdxOptions.recmaPlugins ?? []) {
    if (Array.isArray(recmaPlugin) && typeof recmaPlugin[0] === 'string') {
      recmaPlugin[0] = interopDefault(await import(recmaPlugin[0]))
    }
  }

  for (const rehypePlugin of userProvidedMdxOptions.rehypePlugins ?? []) {
    if (Array.isArray(rehypePlugin) && typeof rehypePlugin[0] === 'string') {
      rehypePlugin[0] = interopDefault(await import(rehypePlugin[0]))
    }
  }

  for (const remarkPlugin of userProvidedMdxOptions.remarkPlugins ?? []) {
    if (Array.isArray(remarkPlugin) && typeof remarkPlugin[0] === 'string') {
      remarkPlugin[0] = interopDefault(await import(remarkPlugin[0]))
    }
  }

  const proxy = new Proxy(this, {
    get(target, prop, receiver) {
      if (prop === 'getOptions') {
        return () => userProvidedMdxOptions
      }

      if (prop === 'async') {
        return () => target.async().bind(target)
      }

      return Reflect.get(target, prop, receiver)
    },
  })

  mdxLoader.call(proxy, ...args)
}
