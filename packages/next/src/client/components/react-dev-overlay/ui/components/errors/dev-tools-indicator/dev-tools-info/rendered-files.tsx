import { useState, type HTMLProps } from 'react'
import { css } from '../../../../../utils/css'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'

import type { TreeNode } from '../../../../../../../../shared/lib/devtool-context.shared-runtime'

const IconLayout = (props: any) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="7" height="9" x="3" y="3" rx="1"></rect>
      <rect width="7" height="5" x="14" y="3" rx="1"></rect>
      <rect width="7" height="9" x="14" y="12" rx="1"></rect>
      <rect width="7" height="5" x="3" y="16" rx="1"></rect>
    </svg>
  )
}

const IconPage = (props: any) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
    </svg>
  )
}

const ICONS = {
  layout: <IconLayout width={16} />,
  page: <IconPage width={16} />,
}

function TreePanel({ tree }: { tree: TreeNode }) {
  return (
    <div className="tree-panel">
      <TreeNodeDisplay node={tree} level={1} />
    </div>
  )
}

const TreeNodeDisplay = ({
  node,
  level,
}: {
  node: TreeNode
  level: number
}) => {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className="tree-node-display"
      style={{ paddingLeft: `${level * 8}px` }}
    >
      <div className="tree-node-display-row">
        <button
          onClick={() => setExpanded(!expanded)}
          className="tree-node-select-button"
        >
          {Object.keys(node.children).length > 0
            ? expanded
              ? '▼'
              : '▶'
            : ''}
        </button>
        <div className="tree-node-line-info">
          <div>

            {ICONS[node.name as 'layout' | 'page']}
            <b>{node.name[0].toLocaleUpperCase() + node.name.slice(1)}</b>
          </div>

          <div className="tree-node-filename-path">
            <a href={`vscode://file/${node.nodeInfo.filePath}`}>{node.pagePath}</a>
          </div>
          {/* <div className="text-xs text-gray-400">{node.nodeInfo.filePath}</div> */}
        </div>
      </div>

      {expanded && (
        <div className="tree-node-expanded-rendered-children">
          {Object.entries(node.children).map(([key, child]) => (
            <TreeNodeDisplay key={key} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function RenderedFiles(
  props: DevToolsInfoPropsCore & HTMLProps<HTMLDivElement>
) {
  // derive initial theme from system preference
  return (
    <DevToolsInfo title="Rendered Views" {...props}>
      <TreePanel tree={(window as any).__NEXT_DEVTOOL_TREE} />
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_RENDER_FILES_STYLES = css`
  .tree-panel {
    padding: 6px;
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
    color: var(--color-gray-600);
    cursor: pointer;
    text-decoration: underline;
    font-size: var(--size-14);

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
`
