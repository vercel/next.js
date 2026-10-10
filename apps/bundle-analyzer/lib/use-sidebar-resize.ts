'use client'

import { useEffect, useState } from 'react'

const MIN_SIDEBAR_WIDTH = 10
const MAX_SIDEBAR_WIDTH = 50

/** Shared mouse-drag behavior for the analyzer's right-hand sidebars. */
export function useSidebarResize(initialWidth = 20) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      const width =
        ((window.innerWidth - event.clientX) / window.innerWidth) * 100
      setSidebarWidth(
        Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width))
      )
    }
    const handleMouseUp = () => setIsResizing(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return {
    sidebarWidth,
    startResizing: () => setIsResizing(true),
  }
}
