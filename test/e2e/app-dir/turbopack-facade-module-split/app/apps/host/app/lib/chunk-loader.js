// Slim extraction of remote-components@0.4.15's chunk loading, reduced to
// what this repro needs. Semantics are taken from the package source
// (src/runtime/turbopack/chunk-loader.ts): fetch chunk text, install a push
// interceptor on the chunk-loading global, execute the chunk via a blob
// script, then drain the runtime-native CHUNK_LISTS queue recursively.

function installPushInterceptor(scope, globalProp) {
  const self = globalThis
  const existing = self[globalProp]
  if (existing && existing.__scope === scope) {
    return
  }

  const wrapPush = (target) => {
    const originalPush = target.push
    if (typeof originalPush !== 'function') {
      return target
    }
    target.push = (...items) => {
      for (const item of items) {
        if (Array.isArray(item)) {
          for (const entry of item) {
            target.__scope.turbopackModules.push(entry)
          }
        } else {
          target.__scope.turbopackModules.push(item)
        }
      }
      return originalPush.apply(target, items)
    }
    return target
  }

  const target = wrapPush(Array.isArray(existing) ? existing : [])
  target.__scope = scope
  // Migrate anything a previous scope's interceptor captured into the new
  // scope (React StrictMode mounts the effect twice).
  if (Array.isArray(existing)) {
    for (const entry of existing) {
      scope.turbopackModules.push(entry)
    }
  }

  let currentValue = target
  Object.defineProperty(self, globalProp, {
    get() {
      return currentValue
    },
    set(newValue) {
      if (newValue && typeof newValue === 'object') {
        wrapPush(newValue)
      }
      currentValue = newValue
    },
    configurable: true,
    enumerable: true,
  })
}

function executeCode(code, url) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([code], {
      type: 'application/javascript; charset=UTF-8',
    })
    const scriptUrl = URL.createObjectURL(blob)
    const script = document.createElement('script')
    script.setAttribute('data-turbopack-src', url)
    script.src = scriptUrl
    script.async = true
    script.onload = () => {
      URL.revokeObjectURL(scriptUrl)
      script.remove()
      resolve()
    }
    script.onerror = () => {
      URL.revokeObjectURL(scriptUrl)
      script.remove()
      reject(new Error(`Failed to load chunk ${url}`))
    }
    document.head.appendChild(script)
  })
}

// Mirrors loadChunkWithScope: fetch, execute with interceptor, then drain
// `${globalProp}_CHUNK_LISTS` and load referenced chunks.
export async function loadChunkWithScope(scope, url) {
  if (scope.chunkCache[url]) {
    return scope.chunkCache[url]
  }
  scope.chunkCache[url] = (async () => {
    installPushInterceptor(scope, scope.globalProp)
    const code = await fetch(url).then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch chunk ${url}: ${res.status}`)
      }
      return res.text()
    })
    await executeCode(code, url)

    const chunkLists = globalThis[`${scope.globalProp}_CHUNK_LISTS`]
    const pending = []
    while (chunkLists?.length) {
      const { chunks } = chunkLists.shift() ?? { chunks: [] }
      for (const id of chunks) {
        if (typeof id !== 'string') continue
        if (id.includes('turbopack') || id.includes('hmr-client')) continue
        const baseUrl = url.slice(0, url.indexOf('/_next'))
        pending.push(loadChunkWithScope(scope, `${baseUrl}/_next/${id}`))
      }
    }
    await Promise.all(pending)
  })()
  return scope.chunkCache[url]
}
