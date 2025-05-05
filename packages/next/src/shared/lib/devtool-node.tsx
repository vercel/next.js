'use client'

import React, { type ReactNode, useEffect } from 'react'
import { DevToolContext, type TreeNode } from './devtool-context.shared-runtime'

const createRegisterNode =
  (setTree: (tree: TreeNode | ((prevTree: TreeNode) => TreeNode)) => void) =>
  ({
    pagePath,
    name,
    parentPagePath,
    nodeInfo,
  }: {
    pagePath: string
    name: string
    parentPagePath: string
    nodeInfo: any
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
            nodeInfo: nodeInfo,
          }
        }
      } else {
        // If parent not found, create a new node at the root level
        prevTree.children[pagePath] = {
          name,
          pagePath,
          children: {},
          nodeInfo: nodeInfo,
        }
      }

      return { ...prevTree }
    })
  }

export const DevToolRootNode = ({ children }: { children: ReactNode }) => {
  const [tree, setTree] = React.useState<TreeNode>({
    name: 'root',
    nodeInfo: {
      filePath: '<project>',
    },
    pagePath: '',
    children: {},
  })

  const registerNode = createRegisterNode(setTree)
  useEffect(() => {
    ;(window as any).__NEXT_DEVTOOL_TREE = tree
  }, [tree])

  return (
    <DevToolContext value={{ tree, registerNode, pagePath: '' }}>
      {children}
    </DevToolContext>
  )
}

const useDevTool = () => {
  const context = React.useContext(DevToolContext)
  return context
}

export function DevToolNode({
  filePath,
  pagePath,
  children,
  name,
}: {
  filePath: string
  pagePath: string
  children: ReactNode
  name: string
}) {
  const devToolContext = useDevTool()

  useEffect(() => {
    if (!devToolContext) {
      return
    }
    const { registerNode, pagePath: parentPagePath } = devToolContext
    registerNode({
      parentPagePath,
      name,
      pagePath,
      nodeInfo: { filePath },
    })
    // Skip adding `devToolContext` to the dependency array to avoid re-rendering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, name, pagePath])

  if (!devToolContext) {
    return children
  }

  return (
    <DevToolContext
      value={{
        ...devToolContext,
        pagePath,
      }}
    >
      {children}
    </DevToolContext>
  )
}
