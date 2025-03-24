'use client'

import { createContext } from 'react'

export const DevToolContext = createContext<DevToolContextType | null>(null)

if (process.env.NODE_ENV !== 'production') {
  DevToolContext.displayName = 'DevToolContext'
}

export type TreeNode = {
  name: string // component name, layout, page, not-found etc
  pagePath: string // e.g. /blog/[slug]
  children: Record<string, TreeNode>
  // {
  //   filePath: string .e.g. /(group)/blog/[slug].tsx
  // }
  nodeInfo: any
}

export type DevToolContextType = {
  tree: TreeNode
  pagePath: string // pagePath of the current segment
  registerNode: ({
    pagePath,
    name,
    parentPagePath,
    nodeInfo,
  }: {
    pagePath: string
    name: string
    parentPagePath: string
    nodeInfo: any
  }) => void
}

