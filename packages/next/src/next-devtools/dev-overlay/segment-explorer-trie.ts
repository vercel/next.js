import { useSyncExternalStore } from 'react'
import type { SegmentNodeState } from '../userspace/app/segment-explorer-node'

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
  getCharacters = (item: Value) => [item] as string[],
  compare = (a: Value | undefined, b: Value | undefined) => a === b,
}: {
  getCharacters?: (item: Value) => string[]
  compare?: (a: Value | undefined, b: Value | undefined) => boolean
}): Trie<Value> {
  let root: TrieNode<Value> = {
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
    const segments = getCharacters(value)

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

    root = { ...root }
    markUpdated()
  }

  function remove(value: Value) {
    let currentNode = root
    const segments = getCharacters(value)

    const stack: TrieNode<Value>[] = []
    let found = true
    for (const segment of segments) {
      if (!currentNode.children[segment]) {
        found = false
        break
      }
      stack.push(currentNode)
      currentNode = currentNode.children[segment]!
    }
    // If the value is not found, skip removal
    if (!found || !compare(currentNode.value, value)) {
      return
    }
    currentNode.value = undefined
    for (let i = stack.length - 1; i >= 0; i--) {
      const parentNode = stack[i]
      const segment = segments[i]
      if (Object.keys(parentNode.children[segment]!.children).length === 0) {
        delete parentNode.children[segment]
      }
    }

    root = { ...root }
    markUpdated()
  }

  function getRoot(): TrieNode<Value> {
    return root
  }

  return { insert, remove, getRoot }
}

type SegmentTrie = Trie<SegmentNodeState>
export type SegmentTrieNode = TrieNode<SegmentNodeState>

const trie: SegmentTrie = createTrie({
  compare: (a, b) => {
    if (!a || !b) return false
    return (
      a.pagePath === b.pagePath &&
      a.type === b.type &&
      a.boundaryType === b.boundaryType
    )
  },
  getCharacters: (item) => item.pagePath.split('/'),
})
export const insertSegmentNode = trie.insert
export const removeSegmentNode = trie.remove
export const getSegmentTrieRoot = trie.getRoot

export function useSegmentTree(): SegmentTrieNode {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return state
}
