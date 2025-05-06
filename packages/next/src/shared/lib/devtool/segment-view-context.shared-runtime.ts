'use client'

import { createContext } from 'react'

export const SegmentViewContext = createContext<SegmentViewContextType | null>(
  null
)

if (process.env.NODE_ENV !== 'production') {
  SegmentViewContext.displayName = 'SegmentViewContext'
}

export type TreeNode = {
  name: string // component name, layout, page, not-found etc
  pagePath: string // e.g. /blog/[slug]
  children: Record<string, TreeNode>
}

type SegmentViewContextType = {
  tree: TreeNode
  pagePath: string // pagePath of the current segment
  registerNode: ({
    pagePath,
    name,
    parentPagePath,
  }: {
    pagePath: string
    name: string
    parentPagePath: string
  }) => void
}
