import { useRef, type HTMLProps } from 'react'
import { css } from '../../../../../utils/css'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'
import type { AppSegmentTreeNode } from '../../../../../../../../shared/lib/devtool/app-segment-tree-context.shared-runtime'
import { cx } from '../../../../utils/cx'
import { LeftArrow } from '../../../../icons/left-arrow'
import { useSegmentTreeClientState } from '../../../../../../../../shared/lib/devtool/app-segment-tree'
import type {
  Trie,
  TrieNode,
} from '../../../../../../../../shared/lib/devtool/trie'

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
        fill="#666666"
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

function PageSegmentTree({ tree }: { tree: Trie | undefined }) {
  const renderedRef = useRef<Record<string, number>>({})
  if (!tree) {
    return null
  }
  return (
    <div className="segment-explorer-content">
      <PageSegmentTreeLayerPresentation
        node={tree.getRoot()}
        level={0}
        renderedRef={renderedRef}
      />
    </div>
  )
}

function PageSegmentTreeLayerPresentation({
  node,
  level,
  renderedRef,
}: {
  node: TrieNode
  level: number
  renderedRef: React.RefObject<Record<string, number>>
}) {
  // Store the level number for each segment.
  // Check if the node has been rendered before
  const renderedLevel = renderedRef.current[node.value || '']
  const hasRenderedBefore = typeof renderedLevel !== 'undefined'
  if (hasRenderedBefore && renderedLevel !== level) {
    return null
  }

  if (
    // Skip '' pagePath of root node
    node.value &&
    !hasRenderedBefore
  ) {
    renderedRef.current[node.value] = level
  }
  const segments = node.value?.split('/') || []
  const fileName = segments[segments.length - 1]
  const nodeName = fileName.split('.')[0] === 'layout' ? 'layout' : 'page'

  const pagePath = segments.slice(0, -1).join('/')
  const fileBaseName = segments[segments.length - 1]

  return (
    <div className="segment-explorer-item">
      {level === 0 ? null : (
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
              {pagePath === '' ? '' : `${pagePath}/`}
              <span className="segment-explorer-filename-path">
                {fileBaseName}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="tree-node-expanded-rendered-children">
        {Object.entries(node.children)
          // Sort the segments by the number of segments levels,
          // prioritize the parental segments on the top.
          .sort((keyA, keyB) => {
            const segA = keyA[0].split('/').length
            const segB = keyB[0].split('/').length

            return segA - segB
          })
          .map(([key, child]) =>
            !!(child && child?.value) ? (
              <PageSegmentTreeLayerPresentation
                key={key}
                node={child}
                level={level + 1}
                renderedRef={renderedRef}
              />
            ) : null
          )}
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

  // derive initial theme from system preference
  return (
    <DevToolsInfo
      title={
        <>
          <button
            className="segment-explorer-back-button"
            onClick={props.close}
          >
            <LeftArrow />
          </button>
          {'Segment Explorer'}
        </>
      }
      closeButton={false}
      {...props}
    >
      <PageSegmentTree tree={ctx.tree} />
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_RENDER_FILES_STYLES = css`
  .segment-explorer-back-button {
    margin-right: 12px;
  }
  .segment-explorer-back-button svg {
    width: 20px;
    height: 20px;
  }

  .segment-explorer-content {
    overflow-y: auto;
    padding: 0 12px;
    font-size: var(--size-14);
  }

  .segment-explorer-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .segment-explorer-filename-path {
    display: inline-block;
    text-decoration-color: #b4b4b4;

    &:hover {
      color: var(--color-gray-1000);
      text-decoration: none;
    }
  }

  .segment-explorer-filename-path a {
    color: inherit;
    text-decoration: inherit;
  }

  .segment-explorer-line {
    white-space: pre;
  }

  .segment-explorer-line-icon {
    margin-right: 4px;
  }

  .segment-explorer-line-text-page {
    color: var(--color-blue-900);
    font-weight: 500;
  }
`
