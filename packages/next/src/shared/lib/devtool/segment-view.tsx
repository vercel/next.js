'use client'

import React, { type ReactNode, useEffect } from 'react'
import {
  SegmentViewContext,
  type TreeNode,
} from './segment-view-context.shared-runtime'

const createRegisterNode =
  (setTree: (tree: TreeNode | ((prevTree: TreeNode) => TreeNode)) => void) =>
  ({
    pagePath,
    name,
    parentPagePath,
  }: {
    pagePath: string
    name: string
    parentPagePath: string
  }): void => {
    setTree((prevTree) => {
      const findNode = (node: TreeNode): TreeNode | null => {
        // Locate the parent node by comparing pagePath
        if (node.pagePath === parentPagePath) return node
        for (const childKey of Object.keys(node.children)) {
          const child = node.children[childKey]
          const found = findNode(child)
          if (found) return found
        }
        return null
      }

      const parent = findNode(prevTree)
      if (parent) {
        if (!parent.children[pagePath]) {
          parent.children[pagePath] = {
            name,
            pagePath,
            children: {},
          }
        }
      } else {
        // If parent not found, create a new node at the root level
        prevTree.children[pagePath] = {
          name,
          pagePath,
          children: {},
        }
      }

      return { ...prevTree }
    })
  }

export const SegmentViewRoot = ({ children }: { children: ReactNode }) => {
  const rootPagePath = ''
  const [tree, setTree] = React.useState<TreeNode>(
    // Root node with placeholder information
    {
      name: 'root',
      pagePath: rootPagePath,
      children: {},
    }
  )

  const registerNode = createRegisterNode(setTree)

  return (
    <SegmentViewContext value={{ tree, registerNode, pagePath: rootPagePath }}>
      {children}
    </SegmentViewContext>
  )
}

export const useSegmentViewContext = () => {
  return React.useContext(SegmentViewContext)
}

export function SegmentViewNode({
  name,
  pagePath,
  children,
}: {
  name: string
  pagePath: string
  children: ReactNode
}) {
  const devToolContext = useSegmentViewContext()

  useEffect(() => {
    if (!devToolContext) {
      return
    }
    const { registerNode, pagePath: parentPagePath } = devToolContext
    registerNode({
      parentPagePath,
      name,
      pagePath,
    })
    // Skip adding `devToolContext` to the dependency array to avoid re-rendering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pagePath])

  if (!devToolContext) {
    return children
  }

  return (
    <SegmentViewContext
      value={{
        ...devToolContext,
        pagePath,
      }}
    >
      {children}
    </SegmentViewContext>
  )
}
