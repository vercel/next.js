import { useMemo } from 'react'
import { FilePill } from './segment-explorer'
import {
  isBoundaryFile,
  getBoundaryOriginFileType,
} from '../../../../server/app-render/segment-explorer-path'
import type { SegmentTrieNode } from '../../segment-explorer-trie'

export function SegmentSuggestion({
  segment,
  node,
  possibleExtension,
}: {
  segment: string
  node: SegmentTrieNode
  possibleExtension: string
}) {
  const isDynamicSegment =
    segment && segment.startsWith('[') && segment.endsWith(']')
  const boundaryTypes = ['not-found', 'error'].concat(
    isDynamicSegment ? ['loading'] : []
  )
  const childrenKeys = useMemo(
    () => Object.keys(node.children),
    [node.children]
  )
  const missingBoundaryTypes = useMemo(() => {
    const existingBoundaries: string[] = []
    childrenKeys.forEach((key) => {
      const childNode = node.children[key]
      if (!childNode || !childNode.value) return false
      if (isBoundaryFile(childNode.value.type)) {
        const boundaryType = getBoundaryOriginFileType(childNode.value.type)
        existingBoundaries.push(boundaryType)
      }
    })
    return boundaryTypes.filter((type) => !existingBoundaries.includes(type))
  }, [node.children, childrenKeys, boundaryTypes])

  return (
    <div className="segment-explorer-suggestions">
      <p>
        This segment may be missing the following special files:
        {missingBoundaryTypes.map((type) => {
          return (
            <FilePill
              key={type}
              type={type}
              isBuiltin={true}
              isOverridden={false}
              filePath={type + '.' + possibleExtension}
              fileName={type + '.' + possibleExtension}
            />
          )
        })}
      </p>
    </div>
  )
}
