'use client'

import { type ReactNode, useEffect, useSyncExternalStore } from 'react'
import { createTrie, type Trie } from './trie'

export type SegmentNode = {
  type: string
  pagePath: string
}

type DevtoolClientState = {
  tree?: Trie<SegmentNode>
}

const DEFAULT_CLIENT_STATE =
  typeof window === 'undefined'
    ? undefined
    : createTrie<SegmentNode>({
        getKey: (item) => item.pagePath,
      })

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
  return window.__NEXT_DEVTOOLS_CLIENT_STATE
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

const { subscribe, getSnapshot, getServerSnapshot } = createSegmentTreeStore()

export function SegmentViewNode({
  type,
  pagePath,
  children,
}: {
  type: string
  pagePath: string
  children: ReactNode
}) {
  const clientState = getSegmentTreeClientState()
  const tree = clientState.tree

  useEffect(() => {
    if (!tree) {
      return
    }
    tree.insert({
      type,
      pagePath,
    })
  }, [type, pagePath, tree])

  return children
}

export function useSegmentTreeClientState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return state
}
