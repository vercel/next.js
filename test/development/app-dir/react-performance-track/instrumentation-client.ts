export {}

declare global {
  interface Window {
    reactServerRequests: Array<{
      name: string
      properties: any
    }>
  }

  interface PerformanceEntry {
    detail?: any
  }
}

window.reactServerRequests = []

// We're trying to mock how the Chrome DevTools performance panel will display
// React performance data. React might decide to use console.timeStamp instead
// or any other method that will be picked up by the performance panel so this
// logic may have to be adjusted when updating React. A change here, doesn't
// mean it's a breaking change in React nor Next.js.
new PerformanceObserver((entries) => {
  for (const entry of entries.getEntries()) {
    if (entry.detail?.devtools?.track === 'Server Requests ⚛') {
      window.reactServerRequests.push({
        name: entry.name,
        properties: entry.detail.devtools.properties,
      })
    }
  }
  console.log(window.reactServerRequests)
}).observe({ entryTypes: ['measure'] })
