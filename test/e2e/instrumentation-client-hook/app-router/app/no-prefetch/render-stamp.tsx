'use client'

import { useEffect } from 'react'

// Records every distinct server render of the page into a window array, so
// tests can tell when a refresh() has re-rendered the page after a navigation
// (the navigation and the refresh each produce their own stamp).
export function RenderStamp({ stamp }: { stamp: number }) {
  useEffect(() => {
    const w = window as any
    w.__NO_PREFETCH_RENDER_STAMPS = w.__NO_PREFETCH_RENDER_STAMPS || []
    w.__NO_PREFETCH_RENDER_STAMPS.push(stamp)
  }, [stamp])
  return null
}
