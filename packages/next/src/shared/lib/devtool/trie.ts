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

export type TrieNode = {
  value?: string
  children: {
    [key: string]: TrieNode | undefined
  }
}

export type Trie = {
  insert: (value: string) => void
  search: (value: string) => boolean
  getRoot: () => TrieNode
}

export function createTrie(): Trie {
  const root: TrieNode = {
    value: '',
    children: {},
  }

  function insert(value: string) {
    let currentNode = root
    const segments = value.split('/')

    for (const segment of segments) {
      if (!currentNode.children[segment]) {
        currentNode.children[segment] = {
          // Skip value for intermediate nodes
          children: {},
        }
      }
      currentNode = currentNode.children[segment]!
    }

    currentNode.value = value
  }

  function search(value: string): boolean {
    let currentNode = root
    const segments = value.split('/')

    for (const segment of segments) {
      if (!currentNode.children[segment]) {
        return false
      }
      currentNode = currentNode.children[segment]!
    }

    return currentNode.value === value
  }

  function getRoot(): TrieNode {
    return root
  }

  return { insert, search, getRoot }
}
