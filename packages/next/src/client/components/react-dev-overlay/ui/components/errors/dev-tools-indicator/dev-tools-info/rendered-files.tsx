import { useState, type HTMLProps } from 'react'
import { css } from '../../../../../utils/css'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'

import type { TreeNode } from '../../../../../../../../shared/lib/devtool-context.shared-runtime'
import { useOpenInEditor } from '../../../../utils/use-open-in-editor'

function TreePanel({ tree }: { tree: TreeNode }) {
  return (
    <div className="tree-panel">
      <h2 className="text-lg font-bold mb-2">Component Tree</h2>
      <TreeNodeDisplay node={tree} level={0} />
    </div>
  )
}

const TreeNodeDisplay = ({ node, level }: { node: TreeNode, level: number }) => {
  const [expanded, setExpanded] = useState(false)
  const openFile = useOpenInEditor(
    node.nodeInfo.filePath,
  )

  return (
    <div className="tree-node-display" style={{ paddingLeft: `${level * 16}px` }}>
      <div className="tree-node-display-row">
        <button
          onClick={() => setExpanded(!expanded)}
          className="tree-node-select-button"
        >
          {Object.keys(node.children).length > 0
            ? expanded
              ? '▼'
              : '▶'
            : '•'}
        </button>
        <div className="text-sm">
          <span className="font-semibold text-blue-600">
            <b>{node.name}</b>
          </span>
          <span className="text-gray-500"
            onClick={() => {
              // open the link of node.nodeInfo.filePath
              if (node.nodeInfo.filePath) {
                openFile()  
              }
            }}
          >({node.pagePath})</span>
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
    <DevToolsInfo title="RenderFiles" {...props}>
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

  .preference-section:last-child {
    border-bottom: none;
  }

  .preference-header {
    margin-bottom: 0;
    flex: 1;
  }

  .preference-header label {
    font-size: var(--size-14);
    font-weight: 500;
    color: var(--color-gray-1000);
    margin: 0;
  }

  .preference-description {
    color: var(--color-gray-900);
    font-size: var(--size-14);
    margin: 0;
  }

  .select-button,
  .action-button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-lg);
    font-weight: 400;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    padding: 6px 8px;

    &:hover {
      background: var(--color-gray-100);
    }
  }

  .select-button {
    &:focus-within {
      outline: var(--focus-ring);
    }

    select {
      all: unset;
    }
  }

  :global(.icon) {
    width: 18px;
    height: 18px;
    color: #666;
  }
`
