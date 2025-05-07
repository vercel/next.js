'use client'

import {
  type ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react'
import {
  AppSegmentTreeContext,
  type AppSegmentTreeNode,
} from './app-segment-tree-context.shared-runtime'

type DevtoolClientState = {
  tree?: AppSegmentTreeNode
}

const DEFAULT_CLIENT_STATE =
  typeof window === 'undefined'
    ? undefined
    : {
        name: 'root',
        pagePath: '',
        children: {},
      }

declare global {
  interface Window {
    __NEXT_DEVTOOLS_CLIENT_STATE?: DevtoolClientState
  }
}

function getSegmentTreeClientState(): DevtoolClientState {
  if (typeof window === 'undefined') {
    return {}
  }
  if (!window.__NEXT_DEVTOOLS_CLIENT_STATE) {
    window.__NEXT_DEVTOOLS_CLIENT_STATE = {
      // Initial state
      tree: DEFAULT_CLIENT_STATE,
    }
  }
  return window.__NEXT_DEVTOOLS_CLIENT_STATE!
}

const listeners = typeof window === 'undefined' ? null : new Set<() => void>()

const createSegmentTreeStore = (): {
  subscribe: (callback: () => void) => () => void
  getSnapshot: () => DevtoolClientState
  getServerSnapshot: () => undefined
} => {
  if (typeof window === 'undefined') {
    return {
      subscribe: () => () => void 0,
      getSnapshot: () => ({}),
      getServerSnapshot: () => undefined,
    }
  }

  // return a store that can be used by useSyncExternalStore
  return {
    subscribe: (callback) => {
      listeners?.add(callback)
      return () => listeners?.delete(callback)
    },
    getSnapshot: () => {
      return getSegmentTreeClientState()
    },
    getServerSnapshot: () => {
      return undefined
    },
  }
}

const createRegisterNode =
  (
    setTree: (tree: AppSegmentTreeNode) => void,
    getTree: () => AppSegmentTreeNode
  ) =>
  ({
    pagePath,
    name,
    parentPagePath,
  }: {
    pagePath: string
    name: string
    parentPagePath: string
  }): void => {
    const currentTree = getTree()
    const findNode = (node: AppSegmentTreeNode): AppSegmentTreeNode | null => {
      // Locate the parent node by comparing pagePath
      if (node.pagePath === parentPagePath) return node
      for (const childKey of Object.keys(node.children)) {
        const child = node.children[childKey]
        const found = findNode(child)
        if (found) return found
      }
      return null
    }

    const parent = findNode(currentTree)
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
      currentTree.children[pagePath] = {
        name,
        pagePath,
        children: {},
      }
    }
    setTree(currentTree)
  }

const { subscribe, getSnapshot, getServerSnapshot } = createSegmentTreeStore()

const setTree = (newTree: AppSegmentTreeNode) => {
  if (typeof window === 'undefined') return

  const clientState = getSegmentTreeClientState()
  clientState.tree = newTree
  listeners?.forEach((listener) => listener())
}

function getStateTree() {
  const clientState = getSegmentTreeClientState()
  return clientState.tree!
}

const setStateTree = (newTree: AppSegmentTreeNode) => {
  setTree(newTree)
  subscribe(() => {
    const clientState = getSegmentTreeClientState()
    clientState.tree = newTree
  })
  return () => {
    if (window.__NEXT_DEVTOOLS_CLIENT_STATE) {
      window.__NEXT_DEVTOOLS_CLIENT_STATE = {
        tree: DEFAULT_CLIENT_STATE,
      }
    }
  }
}

const registerNode = createRegisterNode(setStateTree, getStateTree)

export const SegmentViewRoot = ({ children }: { children: ReactNode }) => {
  return (
    <AppSegmentTreeContext value={{ pagePath: '' }}>
      {children}
    </AppSegmentTreeContext>
  )
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
  const segmentTreeCtx = useContext(AppSegmentTreeContext)

  useEffect(() => {
    if (!segmentTreeCtx) {
      return
    }
    const { pagePath: parentPagePath } = segmentTreeCtx
    registerNode({
      parentPagePath,
      name,
      pagePath,
    })
    // Skip adding `context` to the dependency array to avoid re-rendering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pagePath])

  if (!segmentTreeCtx) {
    return children
  }

  return (
    <AppSegmentTreeContext
      value={{
        ...segmentTreeCtx,
        pagePath,
      }}
    >
      {children}
    </AppSegmentTreeContext>
  )
}

export function useSegmentTreeClientState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return state
}
