'use client'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'

export function SegmentViewNode({
  type,
  pagePath,
  children,
}: {
  type: string
  pagePath: string
  children: ReactNode
}) {
  useEffect(() => {
    dispatcher.segmentExplorerNodeAdd(type, pagePath)
    return () => {
      dispatcher.segmentExplorerNodeRemove(type, pagePath)
    }
  }, [type, pagePath])

  return children
}
