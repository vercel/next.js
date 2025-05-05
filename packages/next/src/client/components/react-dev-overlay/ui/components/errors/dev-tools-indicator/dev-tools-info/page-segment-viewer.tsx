import { useRef, type HTMLProps } from 'react'
import { css } from '../../../../../utils/css'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'
import type { TreeNode } from '../../../../../../../../shared/lib/devtool-context.shared-runtime'
import { cx } from '../../../../utils/cx'
import { LeftArrow } from '../../../../icons/left-arrow'

const IconLayout = (props: any) => {
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

const IconPage = (props: any) => {
  return (
    <svg
      {...props}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.18457 0.00488281C9.41351 0.0276021 9.62886 0.128861 9.79297 0.292969L14.207 4.70703C14.3945 4.89453 14.5 5.1489 14.5 5.41406V13.5L14.4873 13.7559C14.3677 14.9323 13.4323 15.8677 12.2559 15.9873L12 16H4L3.74414 15.9873C2.56772 15.8677 1.63227 14.9323 1.5127 13.7559L1.5 13.5V0H9.08594L9.18457 0.00488281ZM3 13.5C3 14.0523 3.44772 14.5 4 14.5H12C12.5523 14.5 13 14.0523 13 13.5V5.62109L8.87891 1.5H3V13.5Z"
        fill="#666666"
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
    <SegmentTreeLayerPresentation
      node={tree}
      level={0}
      renderedRef={renderedRef}
    />
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
  const pathSeg = segments.slice(level, -1).join('/')
  const fileBaseName = node.nodeInfo.filePath.split('/').pop() || ''

  return (
    <div
      className="tree-node-display"
      style={{ paddingLeft: `${Math.max(segments.length - 1, 0) * 16}px` }}
    >
      {level === 0 ? null : (
        <div className="tree-node-display-row">
          <div className="tree-node-line-info">
            <div className={cx(`tree-node-line-info-text-${nodeName}`)}>
              <span
                className={cx(
                  'tree-node-line-info-icon',
                  `tree-node-line-info-icon-${nodeName}`
                )}
              >
                {ICONS[(node.name as 'layout' | 'page') || 'layout']}
              </span>
              {pathSeg}
              {'/'}
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
  // derive initial theme from system preference
  return (
    <DevToolsInfo
      title={
        <>
          {/* back button */}
          <button className="segment-viewer-back-button" onClick={props.close}>
            <LeftArrow />
          </button>
          {'Segments Viewer'}
        </>
      }
      closeButton={false}
      {...props}
    >
      <SegmentTree tree={(window as any).__NEXT_DEVTOOL_TREE} />
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

  .tree-node-display {
    max-height: 300px;
    overflow-y: auto;
  }

  .tree-node-display-row {
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

  .tree-node-line-info {
    white-space: pre;
  }

  .tree-node-line-info-text-page {
    color: black;
  }

  .tree-node-line-info-icon {
    margin-right: 4px;
  }
  .tree-node-line-info-icon-layout {
    color: var(--color-blue-600);
  }
  .tree-node-line-info-icon-page {
    color: var(--color-blue-700);
  }
`
