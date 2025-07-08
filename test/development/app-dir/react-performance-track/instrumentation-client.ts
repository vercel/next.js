export {}

type ReactServerRequests = Array<{
  name: string
  properties: any
}>

declare global {
  interface Window {
    reactServerRequests: {
      getSnapshot(): ReactServerRequests
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
  },
  subscribe: (callback) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },
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
        name: entry.name,
        properties: entry.detail.devtools.properties,
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
