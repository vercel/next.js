import { isPageStatic } from './utils'

export default function worker(
  options: any,
  callback: (err: Error | null, data?: any) => void
) {
  try {
    const { serverBundle, runtimeEnvConfig } = options || ({} as any)
    const result = isPageStatic(serverBundle, runtimeEnvConfig)

    // clear require.cache to prevent running out of memory
    // since the cache is persisted by default
    Object.keys(require.cache).map(modId => {
      const mod = require.cache[modId]
      delete require.cache[modId]
      if (mod.parent) {
        const idx = mod.parent.children.indexOf(mod)
        mod.parent.children.splice(idx, 1)
      }
    })

    callback(null, result)
  } catch (error) {
    callback(error)
  }
}
