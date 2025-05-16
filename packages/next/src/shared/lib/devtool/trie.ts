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

export type TrieNode<Value = string> = {
  value?: Value
  children: {
    [key: string]: TrieNode<Value> | undefined
  }
}

export type Trie<Value = string> = {
  insert: (value: Value) => void
  getRoot: () => TrieNode<Value>
}

export function createTrie<Value = string>({
  getKey = (k) => k as unknown as string,
}: {
  getKey: (k: Value) => string
}): Trie<Value> {
  const root: TrieNode<Value> = {
    value: undefined,
    children: {},
  }

  function insert(value: Value) {
    let currentNode = root
    const key = getKey(value)
    const segments = key.split('/')

    for (const segment of segments) {
      if (!currentNode.children[segment]) {
        currentNode.children[segment] = {
          // Skip value for intermediate nodes
          children: {},
        }
      }
      currentNode = currentNode.children[segment]
    }

    currentNode.value = value
  }

  function getRoot(): TrieNode<Value> {
    return root
  }

  return { insert, getRoot }
}
