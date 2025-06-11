import { useRef, type HTMLProps } from 'react'
import { css } from '../../../utils/css'
import type { DevToolsInfoPropsCore } from '../errors/dev-tools-indicator/dev-tools-info/dev-tools-info'
import { DevToolsInfo } from '../errors/dev-tools-indicator/dev-tools-info/dev-tools-info'
import {
  type SegmentNode,
  useSegmentTreeClientState,
} from '../../../../shared/lib/devtool/app-segment-tree'
import type { Trie, TrieNode } from '../../../../shared/lib/devtool/trie'

function PageSegmentTree({ tree }: { tree: Trie<SegmentNode> | undefined }) {
  const nodeCountRef = useRef(0)
  if (!tree) {
    return null
  }
  return (
    <div
      className="segment-explorer-content"
      data-nextjs-devtool-segment-explorer
    >
      <PageSegmentTreeLayerPresentation
        tree={tree}
        node={tree.getRoot()}
        level={0}
        segment=""
        parentSegment=""
        nodeCountRef={nodeCountRef}
      />
    </div>
  )
}

function PageSegmentTreeLayerPresentation({
  tree,
  segment,
  parentSegment,
  node,
  level,
  nodeCountRef,
}: {
  tree: Trie<SegmentNode>
  segment: string
  parentSegment: string
  node: TrieNode<SegmentNode>
  level: number
  nodeCountRef: React.RefObject<number>
}) {
  const pagePath = node.value?.pagePath || ''
  const nodeName = node.value?.type
  const isFile = !!nodeName

  const segments = pagePath.split('/') || []
  const fileName = isFile ? segments.pop() || '' : ''
  const childrenKeys = Object.keys(node.children)

  const sortedChildrenKeys = childrenKeys.sort((a, b) => {
    // Prioritize if it's a file convention like layout or page,
    // then the rest parallel routes.
    const aHasExt = a.includes('.')
    const bHasExt = b.includes('.')
    if (aHasExt && !bHasExt) return -1
    if (!aHasExt && bHasExt) return 1
    // Otherwise sort alphabetically
    return a.localeCompare(b)
  })

  if (isFile) {
    nodeCountRef.current++
  }

  // check if it has file children
  const hasFileChildren = sortedChildrenKeys.some((key) => {
    const childNode = node.children[key]
    return !!childNode?.value?.type
  })

  const folderName =
    parentSegment ||
    // If it's the 1st level and contains a file, use 'app' as the folder name
    (level === 1 && isFile ? 'app' : '')

  const segLevel = nodeCountRef.current % 2 === 0 ? 'even' : 'odd'

  return (
    <div
      className="segment-explorer-item"
      data-nextjs-devtool-segment-explorer-segment={segment}
    >
      {isFile ? (
        <div
          className="segment-explorer-item-row"
          data-nextjs-devtool-segment-explorer-level={segLevel}
          style={{
            // If it's children levels, show indents if there's any file at that level.
            // Otherwise it's empty folder, no need to show indents.
            // level > 0 && hasFileChildren && 'segment-explorer-children--intended'
            ...(level > 0 && isFile && { paddingLeft: `${level * 8}px` }),
          }}
        >
          <div className="segment-explorer-line">
            <div className={`segment-explorer-line-text-${nodeName}`}>
              <div className="segment-explorer-filename">
                {folderName && (
                  <span className="segment-explorer-filename--path">
                    {folderName}
                  </span>
                )}
                <span className="segment-explorer-filename--name">
                  {fileName}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {sortedChildrenKeys.map((childSegment) => {
        const child = node.children[childSegment]
        if (!child) {
          return null
        }
        return (
          <PageSegmentTreeLayerPresentation
            key={childSegment}
            segment={childSegment}
            parentSegment={segment}
            tree={tree}
            node={child}
            level={hasFileChildren ? level + 1 : level}
            nodeCountRef={nodeCountRef}
          />
        )
      })}
    </div>
  )
}

export function SegmentsExplorer(
  props: DevToolsInfoPropsCore & HTMLProps<HTMLDivElement>
) {
  const ctx = useSegmentTreeClientState()
  if (!ctx) {
    return null
  }

  return (
    <DevToolsInfo title="Segment Explorer" {...props}>
      <PageSegmentTree tree={ctx.tree} />
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_RENDER_FILES_STYLES = css`
  .segment-explorer-content {
    overflow-y: auto;
    font-size: var(--size-14);
    margin: -12px -8px;
  }

  .segment-explorer-item-row {
    display: flex;
    align-items: center;
    padding: 4px 24px;
    border-radius: 6px;
  }

  .segment-explorer-children--intended {
    padding-left: 16px;
  }

  .segment-explorer-filename--path {
    margin-right: 8px;
  }
  .segment-explorer-filename--name {
    color: var(--color-gray-800);
  }

  .segment-explorer-line {
    white-space: pre;
    cursor: default;
  }

  .segment-explorer-line {
    color: var(--color-gray-1000);
  }

  [data-nextjs-devtool-segment-explorer-level='odd'] {
    background-color: var(--color-gray-100);
  }
`
