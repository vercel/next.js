import type { HTMLProps } from 'react'
import { css } from '../../../utils/css'
import type { DevToolsInfoPropsCore } from '../errors/dev-tools-indicator/dev-tools-info/dev-tools-info'
import { DevToolsInfo } from '../errors/dev-tools-indicator/dev-tools-info/dev-tools-info'
import { cx } from '../../utils/cx'
import {
  useSegmentTreeClientState,
  type SegmentNode,
} from '../../../../../../shared/lib/devtool/app-segment-tree'
import type { Trie, TrieNode } from '../../../../../../shared/lib/devtool/trie'

const IconLayout = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      {...props}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 12.5L15.9873 12.7559C15.8677 13.9323 14.9323 14.8677 13.7559 14.9873L13.5 15H2.5L2.24414 14.9873C1.06772 14.8677 0.132274 13.9323 0.0126953 12.7559L0 12.5V1H16V12.5ZM1.5 6.25488V12.5C1.5 13.0523 1.94772 13.5 2.5 13.5H4.99512V6.25488H1.5ZM6.24512 6.25488V13.5H13.5C14.0523 13.5 14.5 13.0523 14.5 12.5V6.25488H6.24512ZM1.5 5.00488H14.5V2.5H1.5V5.00488Z"
        fill="currentColor"
      />
    </svg>
  )
}

const IconPage = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      {...props}
      viewBox="0 0 16 16"
      fill="none"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.5 6.5V13.5C14.5 14.8807 13.3807 16 12 16H4C2.61929 16 1.5 14.8807 1.5 13.5V1.5V0H3H8H9.08579C9.351 0 9.60536 0.105357 9.79289 0.292893L14.2071 4.70711C14.3946 4.89464 14.5 5.149 14.5 5.41421V6.5ZM13 6.5V13.5C13 14.0523 12.5523 14.5 12 14.5H4C3.44772 14.5 3 14.0523 3 13.5V1.5H8V5V6.5H9.5H13ZM9.5 2.12132V5H12.3787L9.5 2.12132Z"
        fill="currentColor"
      />
    </svg>
  )
}

const ICONS = {
  layout: <IconLayout width={16} />,
  page: <IconPage width={16} />,
}

function PageSegmentTree({ tree }: { tree: Trie<SegmentNode> | undefined }) {
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
      />
    </div>
  )
}

function PageSegmentTreeLayerPresentation({
  tree,
  node,
  level,
}: {
  tree: Trie<SegmentNode>
  node: TrieNode<SegmentNode>
  level: number
}) {
  const pagePath = node.value?.pagePath || ''
  const nodeName = node.value?.type

  const segments = pagePath.split('/') || []
  const fileName = segments.pop() || ''
  const segmentPath = segments.join('/')

  let pagePathPrefix = segmentPath

  const childrenKeys = Object.keys(node.children).sort((a, b) => {
    // Prioritize if it's a file convention like layout or page,
    // then the rest parallel routes.
    const aHasExt = a.includes('.')
    const bHasExt = b.includes('.')
    if (aHasExt && !bHasExt) return -1
    if (!aHasExt && bHasExt) return 1
    // Otherwise sort alphabetically
    return a.localeCompare(b)
  })

  return (
    <div
      className={cx(
        'segment-explorer-item',
        level > 1 && 'segment-explorer-item--nested'
      )}
    >
      {!fileName || level === 0 ? null : (
        <div className="segment-explorer-item-row">
          <div className="segment-explorer-line">
            <div className={`segment-explorer-line-text-${nodeName}`}>
              <span
                className={cx(
                  'segment-explorer-line-icon',
                  `segment-explorer-line-icon-${nodeName}`
                )}
              >
                {nodeName === 'layout' ? ICONS.layout : ICONS.page}
              </span>
              {pagePathPrefix === '' ? '' : `${pagePathPrefix}/`}
              <span className="segment-explorer-filename-path">{fileName}</span>
            </div>
          </div>
        </div>
      )}

      <div className="tree-node-expanded-rendered-children">
        {childrenKeys.map((segment) => {
          const child = node.children[segment]
          return (
            child && (
              <PageSegmentTreeLayerPresentation
                key={segment}
                tree={tree}
                node={child}
                level={level + 1}
              />
            )
          )
        })}
      </div>
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
    padding: 0 12px;
    font-size: var(--size-14);
  }

  .segment-explorer-item--nested {
    padding-left: 20px;
  }

  .segment-explorer-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .segment-explorer-filename-path {
    display: inline-block;
  }

  .segment-explorer-filename-path a {
    color: inherit;
    text-decoration: inherit;
  }

  .segment-explorer-line {
    white-space: pre;
    cursor: default;
  }

  .segment-explorer-line-icon {
    margin-right: 4px;
  }
  .segment-explorer-line-icon-page {
    color: inherit;
  }
  .segment-explorer-line-icon-layout {
    color: var(--color-gray-1-00);
  }

  .segment-explorer-line-text-page {
    color: var(--color-blue-900);
    font-weight: 500;
  }
`
