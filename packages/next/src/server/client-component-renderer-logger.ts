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
    require: (...args) => {
      const startTime = performance.now()

      if (clientComponentLoadStart === 0) {
        clientComponentLoadStart = startTime
      }

      try {
        clientComponentLoadCount += 1
        return ComponentMod.__next_app__.require(...args)
      } finally {
        clientComponentLoadTimes += performance.now() - startTime
      }
    },
    loadChunk: (...args) => {
      const startTime = performance.now()
      const result = ComponentMod.__next_app__.loadChunk(...args)
      // Avoid wrapping `loadChunk`'s result in an extra promise in case something like React depends on its identity.
      // We only need to know when it's settled.
      result.finally(() => {
        clientComponentLoadTimes += performance.now() - startTime
      })
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
