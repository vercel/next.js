import type { AppPageModule } from './route-modules/app-page/module'

// Combined load times for loading client components
let clientComponentLoadStart = 0
let clientComponentLoadTimes = 0
let clientComponentLoadCount = 0

export function wrapClientComponentLoader(
  ComponentMod: AppPageModule
): AppPageModule['__next_app__'] {
  if (!('performance' in globalThis)) {
    return ComponentMod.__next_app__
  }

  return {
    require: (id) => {
      const startTime = performance.now()

      if (clientComponentLoadStart === 0) {
        clientComponentLoadStart = startTime
      }

      try {
        clientComponentLoadCount += 1
        return ComponentMod.__next_app__.require(id)
      } finally {
        clientComponentLoadTimes += performance.now() - startTime
      }
    },
    loadChunk: (id) => {
      const startTime = performance.now()
      const result = ComponentMod.__next_app__.loadChunk(id)
      if (result) {
        // Avoid wrapping `loadChunk`'s result in an extra promise in case something like React depends on its identity.
        // We only need to know when it's settled.
        result.finally(() => {
          clientComponentLoadTimes += performance.now() - startTime
        })
      } else {
        // Synchronous chunk load (e.g. Node.js Turbopack runtime)
        clientComponentLoadTimes += performance.now() - startTime
      }
      return result
    },
  }
}

export function getClientComponentLoaderMetrics(
  options: { reset?: boolean } = {}
) {
  const metrics =
    clientComponentLoadStart === 0
      ? undefined
      : {
          clientComponentLoadStart,
          clientComponentLoadTimes,
          clientComponentLoadCount,
        }

  if (options.reset) {
    clientComponentLoadStart = 0
    clientComponentLoadTimes = 0
    clientComponentLoadCount = 0
  }

  return metrics
}
