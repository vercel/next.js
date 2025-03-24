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

        
      }

      return { ...prevTree }
    })
  }

export const DevToolRootNode = ({
  children,
  pagePath,
}: {
  children: ReactNode
  pagePath: string
}) => {
  const [tree, setTree] = React.useState<TreeNode>({
    name: 'RootEmptyNode',
    nodeInfo: {
      filePath: '<project>',
    },
    pagePath: '',
    children: {},
  })

  const registerNode = createRegisterNode(setTree)


  useEffect(() => {

    ;(window as any).__NEXT_DEVTOOL_TREE = tree
  }, [])

  return (
    <DevToolContext value={{ tree, registerNode, pagePath }}>
      {children}
    </DevToolContext>
  )
}

const useDevTool = () => {
  const context = React.useContext(DevToolContext)
  if (!context) {
    throw new Error('useDevTool must be used within DevToolProvider')
  }
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
  const { registerNode, pagePath: parentPagePath } = devToolContext

  useEffect(() => {
    console.log('register node', pagePath, '-> p', parentPagePath)
    registerNode({
      parentPagePath,
      name,
      pagePath,
      nodeInfo: { filePath },
    })
  }, [])

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
