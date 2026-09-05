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
  // Null-prototype children so segment names that collide with
  // Object.prototype members (e.g. "constructor", "toString") work correctly.
  let root: TrieNode<Value> = {
    value: undefined,
    children: Object.create(null),
  }

  function markUpdated() {
    for (const listener of listeners) {
      listener()
    }
  }

  function copyChildren(children: TrieNode<Value>['children']) {
    return Object.assign(Object.create(null), children)
  }

  // Snapshots must be immutable for `useSyncExternalStore` consumers, so
  // updates copy the nodes along the mutated path instead of mutating them
  // in place. Untouched subtrees stay shared.
  function copyPath(segments: string[]): TrieNode<Value>[] {
    const newRoot: TrieNode<Value> = {
      value: root.value,
      children: copyChildren(root.children),
    }

    const path: TrieNode<Value>[] = [newRoot]
    let currentNode = newRoot
    for (const segment of segments) {
      const existingNode = currentNode.children[segment]
      const copiedNode: TrieNode<Value> = {
        value: existingNode?.value,
        children: existingNode
          ? copyChildren(existingNode.children)
          : Object.create(null),
      }
      currentNode.children[segment] = copiedNode
      currentNode = copiedNode
      path.push(copiedNode)
    }

    return path
  }

  function insert(value: Value) {
    const segments = getCharacters(value)
    const path = copyPath(segments)

    path[path.length - 1].value = value

    root = path[0]
    markUpdated()
  }

  function remove(value: Value) {
    const segments = getCharacters(value)

    // Locate the node first, so a miss doesn't copy or notify.
    let currentNode = root
    for (const segment of segments) {
      const childNode = currentNode.children[segment]
      if (!childNode) {
        return
      }
      currentNode = childNode
    }
    // If the value is not found, skip removal
    if (!compare(currentNode.value, value)) {
      return
    }

    const path = copyPath(segments)
    path[path.length - 1].value = undefined

    // Prune nodes that no longer hold a value or any children.
    for (let i = segments.length - 1; i >= 0; i--) {
      const parentNode = path[i]
      const segment = segments[i]
      const childNode = parentNode.children[segment]!
      if (
        childNode.value === undefined &&
        Object.keys(childNode.children).length === 0
      ) {
        delete parentNode.children[segment]
      }
    }

    root = path[0]
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
