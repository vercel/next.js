import type { NodeFileTraceReasons } from 'next/dist/compiled/@vercel/nft'

export const TRACE_IGNORES = [
  '**/*/next/dist/server/next.js',
  '**/*/next/dist/bin/next',
]

export function getFilesMapFromReasons(
  fileList: Set<string>,
  reasons: NodeFileTraceReasons,
  ignoreFn?: (file: string, parent?: string) => Boolean
) {
  const parentFilesMap = new Map<string, Map<string, { ignored: boolean }>>()

  function propagateToParents(
    parents: Set<string>,
    file: string,
    seen = new Set<string>()
  ) {
    for (const parent of parents || []) {
      if (!seen.has(parent)) {
        seen.add(parent)
        let parentFiles = parentFilesMap.get(parent)

        if (!parentFiles) {
          parentFiles = new Map()
          parentFilesMap.set(parent, parentFiles)
        }
        const ignored = Boolean(ignoreFn?.(file, parent))
        parentFiles.set(file, { ignored })

        const parentReason = reasons.get(parent)

        if (parentReason?.parents) {
          propagateToParents(parentReason.parents, file, seen)
        }
      }
    }
  }

  for (const file of fileList) {
    const reason = reasons.get(file)
    const isInitial =
      reason?.type.length === 1 && reason.type.includes('initial')

    if (
      !reason ||
      !reason.parents ||
      (isInitial && reason.parents.size === 0)
    ) {
      continue
    }
    propagateToParents(reason.parents, file)
  }
  return parentFilesMap
}
