import type { DebugInfo } from '../../../../types'
import { NodejsInspectorButton } from './nodejs-inspector-button'
import { noop as css } from '../../helpers/noop-template'
import { CopyCallStackButton } from './copy-call-stack-button'

type ToolButtonsGroupProps = {
  error: Error | undefined
  debugInfo: DebugInfo | undefined
}

export function ToolButtonsGroup({ error, debugInfo }: ToolButtonsGroupProps) {
  return (
    <span className="tool-buttons-group">
      <CopyCallStackButton error={error} />
      <NodejsInspectorButton
        devtoolsFrontendUrl={debugInfo?.devtoolsFrontendUrl}
      />
    </span>
  )
}

export const styles = css`
  .tool-buttons-group {
    display: flex;
    gap: var(--size-1_5);
  }

  .tool-buttons-group a,
  .tool-buttons-group button {
    display: flex;
    justify-content: center;
    align-items: center;

    margin: 0;
    width: var(--size-8);
    padding: var(--size-1_5);
    background: var(--color-background-100);
    box-shadow: var(--shadow-sm);

    border-radius: var(--rounded-full);
    border: 1px solid var(--color-gray-400);

    &:focus {
      outline: none;
    }

    &:hover {
      background: var(--color-gray-alpha-100);
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }

  .tool-buttons-group button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .tool-button-icon {
    color: var(--color-gray-900);
  }
`
