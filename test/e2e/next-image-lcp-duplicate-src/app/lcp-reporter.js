'use client'

import { useEffect } from 'react'

// Records the `loading` attribute of the element that the browser actually
// reported as the Largest Contentful Paint element.
export function LcpReporter() {
  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = entry.element
        if (element && element.tagName === 'IMG') {
          window.__lcpImageLoading = element.getAttribute('loading')
          window.__lcpImageId = element.id
        }
      }
    })
    observer.observe({ type: 'largest-contentful-paint', buffered: true })
    return () => observer.disconnect()
  }, [])
  return null
}
