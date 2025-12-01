export {}

type ReactServerRequests = Array<{
  type: 'performance' | 'console'
  name: string
  properties: any
  startTime: number
  endTime: number
}>

declare global {
  interface Window {
    reactServerRequests: {
      /** For tests */
      getSnapshot: () => Array<
        Omit<ReactServerRequests[number], 'startTime' | 'endTime' | 'type'>
      >
      getStoreSnapshot(): ReactServerRequests
      subscribe(callback: () => void): () => void
    }
  }

  interface PerformanceEntry {
    detail?: any
  }
}

let reactServerRequests: ReactServerRequests = []
const listeners = new Set<() => void>()

// The store implementation is just a local debugging aid.
// Assertions should happen on `getSnapshot` not on the UI.
window.reactServerRequests = {
  getSnapshot: () => {
    return reactServerRequests
      .filter((request) => {
        const isRegisterTrackRequest =
          request.type === 'console' &&
          request.name === undefined &&
          request.startTime === 0.001 &&
          request.endTime === 0.001

        return !isRegisterTrackRequest
      })
      .map(({ startTime, endTime, type, ...rest }) => rest)
  },
  getStoreSnapshot: () => {
    return reactServerRequests
  },
  subscribe: (callback) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },
}

const originalConsoleTimeStamp = console.timeStamp
console.timeStamp = (...args: any) => {
  originalConsoleTimeStamp.apply(console, args)
  const [name, startTime, endTime, track] = args

  if (track === 'Server Requests ⚛') {
    const isRegisterTrackRequest = startTime === 0.001 && endTime === 0.001
    if (!isRegisterTrackRequest) {
      reactServerRequests.push({
        type: 'console',
        name: name ?? '',
        properties: [],
        startTime,
        endTime,
      })
      for (const listener of listeners) {
        listener()
      }
    }
  }
}

// We're trying to mock how the Chrome DevTools performance panel will display
// React performance data. React might decide to use console.timeStamp instead
// or any other method that will be picked up by the performance panel so this
// logic may have to be adjusted when updating React. A change here, doesn't
// mean it's a breaking change in React nor Next.js.
new PerformanceObserver((entries) => {
  const newRequests: ReactServerRequests = []
  for (const entry of entries.getEntries()) {
    if (entry.detail?.devtools?.track === 'Server Requests ⚛') {
      newRequests.push({
        type: 'performance',
        name: entry.name,
        properties: entry.detail.devtools.properties,
        startTime: entry.startTime,
        endTime: entry.startTime + entry.duration,
      })
    }
  }

  if (newRequests.length > 0) {
    reactServerRequests = reactServerRequests.concat(newRequests)
    for (const listener of listeners) {
      listener()
    }
  }
}).observe({ entryTypes: ['measure'] })
