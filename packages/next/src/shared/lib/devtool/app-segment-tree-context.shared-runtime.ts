'use client'

import { createContext } from 'react'

export type AppSegmentTreeNode = {
  name: string // component name, layout, page, not-found etc
  pagePath: string // e.g. /blog/[slug]
  children: Record<string, AppSegmentTreeNode>
}

type AppSegmentTreeValue = {
  pagePath: string // pagePath of the current segment
}

export const AppSegmentTreeContext = createContext<AppSegmentTreeValue | null>(
  null
)

if (process.env.NODE_ENV !== 'production') {
  AppSegmentTreeContext.displayName = 'AppSegmentTreeContext'
}
