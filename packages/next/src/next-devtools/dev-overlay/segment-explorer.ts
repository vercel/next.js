import { useSyncExternalStore } from 'react'

/**
 * Trie data structure for storing and searching paths
 *
 * This can be used to store app router paths and search for them efficiently.
 * e.g.
 *
 * [trie root]
 *   ├── layout.js
 *   ├── page.js
 *   ├── blog
 *       ├── layout.js
 *       ├── page.js
 *       ├── [slug]
 *          ├── layout.js
 *          ├── page.js
 **/

type TrieNode<Value = string> = {
  value: Value | undefined
  children: {
    [key: string]: TrieNode<Value> | undefined
  }
}

type Trie<Value = string> = {
  insert: (value: Value) => void
  remove: (value: Value) => void
  getRoot: () => TrieNode<Value>
}

const listeners = new Set<() => void>()
const createSegmentTreeStore = (): {
  subscribe: (callback: () => void) => () => void
  getSnapshot: () => SegmentTrieNode
  getServerSnapshot: () => SegmentTrieNode
} => {
  // return a store that can be used by useSyncExternalStore
  return {
    subscribe: (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    getSnapshot: () => {
      return trie.getRoot()
    },
    getServerSnapshot: () => {
      return trie.getRoot()
    },
  }
}

// TODO: Move the Segment Tree into React State
const { subscribe, getSnapshot, getServerSnapshot } = createSegmentTreeStore()

function createTrie<Value = string>({
  getKey = (k) => k as unknown as string,
}: {
  getKey: (k: Value) => string
}): Trie<Value> {
  const root: TrieNode<Value> = {
    value: undefined,
    children: {},
  }

  function markUpdated() {
    for (const listener of listeners) {
      listener()
    }
  }

  function insert(value: Value) {
    let currentNode = root
    const key = getKey(value)
    const segments = key.split('/')

    for (const segment of segments) {
      if (!currentNode.children[segment]) {
        currentNode.children[segment] = {
          value: undefined,
          // Skip value for intermediate nodes
          children: {},
        }
      }
      currentNode = currentNode.children[segment]
    }

    currentNode.value = value

    markUpdated()
  }

  function remove(_: Value) {
    // TODO Implement remove functionality

    markUpdated()
  }

  function getRoot(): TrieNode<Value> {
    return root
  }

  return { insert, remove, getRoot }
}

export type SegmentNode = {
  type: string
  pagePath: string
}

export type SegmentTrie = Trie<SegmentNode>
export type SegmentTrieNode = TrieNode<SegmentNode>

const trie: SegmentTrie = createTrie({
  getKey: (item) => item.pagePath,
})
export const insertSegmentNode = trie.insert
export const removeSegmentNode = trie.remove

export function useSegmentTree(): SegmentTrieNode {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return state
}
