// Combined load times for loading client components
let clientComponentLoadTimes = 0

export function wrapClientComponentLoader(ComponentMod) {
  return {

    loadChunk: (...args) => {
      const startTime = performance.now()
      try {
        return ComponentMod.__next_app__.loadChunk(...args)
      } finally {
        clientComponentLoadTimes += performance.now() - startTime
      }
    },
  }
}

export function getClientComponentLoaderMetrics(
  options = {}
) {
  const metrics =
  clientComponentLoadTimes === 0
      ? undefined
      : {
          clientComponentLoadTimes,
        }

  if (options.reset) {
    clientComponentLoadTimes = 0
  }

  return metrics
}
