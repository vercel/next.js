function isTypeSupported(type) {
  if (self.PerformanceObserver && PerformanceObserver.supportedEntryTypes) {
    return PerformanceObserver.supportedEntryTypes.includes(type)
  }
  return false
}

export function observeLayoutShift(onPerfEntry) {
  if (isTypeSupported('layout-shift')) {
    let cumulativeScore = 0
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input.
        if (!entry.hadRecentInput) {
          cumulativeScore += entry.value
        }
      }
    })
    observer.observe({ type: 'layout-shift', buffered: true })

    document.addEventListener(
      'visibilitychange',
      function clsObserver() {
        if (document.visibilityState === 'hidden') {
          // Force any pending records to be dispatched.
          observer.takeRecords()
          observer.disconnect()
          removeEventListener('visibilitychange', clsObserver, true)
          onPerfEntry({
            name: 'cumulative-layout-shift',
            value: cumulativeScore,
          })
        }
      },
      true
    )
  }
}

export function observeLargestContentfulPaint(onPerfEntry) {
  if (isTypeSupported('largest-contentful-paint')) {
    // Create a variable to hold the latest LCP value (since it can change).
    let lcp

    // Create the PerformanceObserver instance.
    const observer = new PerformanceObserver(entryList => {
      const entries = entryList.getEntries()
      const lastEntry = entries[entries.length - 1]
      lcp = lastEntry.renderTime || lastEntry.loadTime
    })

    observer.observe({ type: 'largest-contentful-paint', buffered: true })

    document.addEventListener(
      'visibilitychange',
      function lcpObserver() {
        if (lcp && document.visibilityState === 'hidden') {
          removeEventListener('visibilitychange', lcpObserver, true)
          onPerfEntry({
            name: 'largest-contentful-paint',
            value: lcp,
          })
        }
      },
      true
    )
  }
}

export function observePaint(onPerfEntry) {
  const observer = new PerformanceObserver(list => {
    list.getEntries().forEach(onPerfEntry)
  })
  observer.observe({
    type: 'paint',
    buffered: true,
  })
}
