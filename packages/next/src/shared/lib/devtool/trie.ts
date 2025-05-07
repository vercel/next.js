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
  // [key: string]: TrieNode | undefined
  value?: string
  children: {
    [key: string]: TrieNode | undefined
  }
}

export type Trie = {
  insert: (value: string) => void
  search: (value: string) => boolean
  getAllPaths: (node: TrieNode, prefix: string) => string[]
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
          value: segment,
          children: {},
        }
      }
      currentNode = currentNode.children[segment]!
    }

    // const lastSegment = segments[segments.length - 1]
    // const baseName = lastSegment.split('.')[0]
    currentNode.value = value // baseName
    
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

    // const lastSegment = segments[segments.length - 1]
    // const baseName = lastSegment.split('.')[0]
    return currentNode.value === value // baseName
  }

  // Function to get all paths in the trie
  function getAllPaths(node: TrieNode, prefix: string): string[] {
    const paths: string[] = []

    if (node.value) {
      paths.push(prefix + node.value)
    }

    for (const key in node.children) {
      if (node.children[key]) {
        paths.push(...getAllPaths(node.children[key]!, prefix + key + '/'))
      }
    }

    return paths
  }

  function getRoot(): TrieNode {
    return root
  }

  return { insert, search, getAllPaths, getRoot }
}