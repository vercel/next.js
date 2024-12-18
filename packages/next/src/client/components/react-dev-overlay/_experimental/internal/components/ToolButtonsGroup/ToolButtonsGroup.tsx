import type { DebugInfo } from '../../../../types'
import { CopyButton } from '../copy-button'
import { NodejsInspectorCopyButton } from '../nodejs-inspector'

type ToolButtonsGroupProps = {
  error: Error
  debugInfo: DebugInfo | undefined
}

export function ToolButtonsGroup({ error, debugInfo }: ToolButtonsGroupProps) {
  return (
    <span>
      <CopyButton
        data-nextjs-data-runtime-error-copy-stack
        actionLabel="Copy error stack"
        successLabel="Copied"
        content={error.stack || ''}
        disabled={!error.stack}
      />
      <NodejsInspectorCopyButton
        devtoolsFrontendUrl={debugInfo?.devtoolsFrontendUrl}
      />
    </span>
  )
}
