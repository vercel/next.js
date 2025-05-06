import { useRef, type HTMLProps } from 'react'
import { css } from '../../../../../utils/css'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'
import type { TreeNode } from '../../../../../../../../shared/lib/devtool/segment-view-context.shared-runtime'
import { cx } from '../../../../utils/cx'
import { LeftArrow } from '../../../../icons/left-arrow'
import { useSegmentViewContext } from '../../../../../../../../shared/lib/devtool/segment-view'

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

function SegmentTree({ tree }: { tree: TreeNode }) {
  const renderedRef = useRef<Record<string, number>>({})
  return (
    <div className="segment-viewer-content">
      <SegmentTreeLayerPresentation
        node={tree}
        level={0}
        renderedRef={renderedRef}
      />
    </div>
  )
}

function SegmentTreeLayerPresentation({
  node,
  level,
  renderedRef,
}: {
  node: TreeNode
  level: number
  renderedRef: React.RefObject<Record<string, number>>
}) {
  // has been rendered in this level
  const renderedLevel = renderedRef.current[node.pagePath]
  const hasRenderedBefore = typeof renderedLevel !== 'undefined'
  if (hasRenderedBefore && renderedLevel !== level) {
    return null
  }

  if (
    // skip '' pagePath of root node
    node.pagePath &&
    !hasRenderedBefore
  ) {
    renderedRef.current[node.pagePath] = level
  }
  const nodeName = node.name || 'root'
  const segments = node.pagePath.split('/')
  const pagePath = segments.slice(0, -1).join('/')
  const fileBaseName = segments[segments.length - 1]

  return (
    <div className="segment-viewer-item">
      {level === 0 ? null : (
        <div className="segment-viewer-item-row">
          <div className="segment-viewer-line">
            <div className={`segment-viewer-line-text-${nodeName}`}>
              <span
                className={cx(
                  'segment-viewer-line-icon',
                  `segment-viewer-line-icon-${nodeName}`
                )}
              >
                {nodeName === 'layout' ? ICONS.layout : ICONS.page}
              </span>
              {pagePath === '' ? '' : `${pagePath}/`}
              <span className="tree-node-filename-path">{fileBaseName}</span>
            </div>
          </div>
        </div>
      )}

      <div className="tree-node-expanded-rendered-children">
        {Object.entries(node.children)
          .sort((keyA, keyB) => {
            // compare the segments length
            const segA = keyA[0].split('/').length
            const segB = keyB[0].split('/').length

            return segA - segB
          })
          .map(([key, child]) => (
            <SegmentTreeLayerPresentation
              key={key}
              node={child}
              level={level + 1}
              renderedRef={renderedRef}
            />
          ))}
      </div>
    </div>
  )
}

export function PageSegmentsViewer(
  props: DevToolsInfoPropsCore & HTMLProps<HTMLDivElement>
) {
  const ctx = useSegmentViewContext()
  if (!ctx) {
    return null
  }

  // derive initial theme from system preference
  return (
    <DevToolsInfo
      title={
        <>
          {/* back button */}
          <button className="segment-viewer-back-button" onClick={props.close}>
            <LeftArrow />
          </button>
          {'Segment Explorer'}
        </>
      }
      closeButton={false}
      {...props}
    >
      <SegmentTree tree={ctx.tree} />
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_RENDER_FILES_STYLES = css`
  .segment-viewer-back-button {
    margin-right: 12px;
  }
  .segment-viewer-back-button svg {
    width: 20px;
    height: 20px;
  }

  .segment-viewer-content {
    overflow-y: auto;
    padding: 0 12px;
    font-size: var(--size-14);
  }

  .segment-viewer-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .tree-node-select-button {
    background: var(--color-background-100);
    border-radius: var(--rounded-lg);
    font-weight: 400;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    margin-bottom: auto;
    cursor: pointer;

    &:hover {
      background: var(--color-gray-100);
    }
  }

  .tree-node-filename-path {
    display: inline-block;
    text-decoration-color: #b4b4b4;

    &:hover {
      color: var(--color-gray-1000);
      text-decoration: none;
    }
  }

  .tree-node-filename-path a {
    color: inherit;
    text-decoration: inherit;
  }

  .segment-viewer-line {
    white-space: pre;
  }

  .segment-viewer-line-icon {
    margin-right: 4px;
  }

  .segment-viewer-line-text-page {
    color: var(--color-blue-900);
    font-weight: 500;
  }
`
