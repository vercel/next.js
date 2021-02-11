import { parse, traverse, NodePath, Node } from 'next/dist/compiled/babel/core'

type NodeDescriptor = { type: string; node?: object }
type BranchDescriptor = NodeDescriptor[]

function pathMatchesBranch(
  initialPath: NodePath,
  branchDescriptor: BranchDescriptor
): boolean {
  let path = initialPath
  for (let i = branchDescriptor.length; i--; ) {
    if (!path || !objectMatchesPattern(path, branchDescriptor[i])) {
      return false
    }
    path = path.parentPath
  }
  return true
}

function objectMatchesPattern(object: any, pattern: any): boolean {
  for (let key in pattern) {
    if (typeof pattern[key] !== typeof object[key]) {
      return false
    }
    if (typeof pattern[key] === 'object') {
      if (!objectMatchesPattern(object[key], pattern[key])) {
        return false
      }
    } else {
      if (pattern[key] !== object[key]) {
        return false
      }
    }
  }
  return true
}

export default function matchAstBranch(
  code: string,
  branchDescriptor: BranchDescriptor
): Node[] {
  let paths: Node[] = []
  traverse(parse(code), {
    enter(path) {
      if (pathMatchesBranch(path, branchDescriptor)) {
        paths.push(path.node)
      }
    },
  })
  return paths
}
