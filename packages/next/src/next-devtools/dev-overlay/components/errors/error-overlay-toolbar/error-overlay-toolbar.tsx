import type { DebugInfo } from '../../../../shared/types'
import { NodejsInspectorButton } from './nodejs-inspector-button'
import { CopyStackTraceButton } from './copy-stack-trace-button'
import { DocsLinkButton } from './docs-link-button'
import { RestartServerButton } from './restart-server-button'

type ErrorOverlayToolbarProps = {
  error: Error
  debugInfo: DebugInfo | undefined
}

export function ErrorOverlayToolbar({
  error,
  debugInfo,
}: ErrorOverlayToolbarProps) {
  return (
    <span className="error-overlay-toolbar">
      <RestartServerButton error={error} />
      <CopyStackTraceButton error={error} />
      <DocsLinkButton errorMessage={error.message} />
      <NodejsInspectorButton
        devtoolsFrontendUrl={debugInfo?.devtoolsFrontendUrl}
      />
    </span>
  )
}

export const styles = `
  .error-overlay-toolbar {
    display: flex;
    gap: 6px;
  }

  .nodejs-inspector-button,
  .copy-stack-trace-button,
  .docs-link-button {
    display: flex;
    justify-content: center;
    align-items: center;

    width: var(--size-28);
    height: var(--size-28);
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    svg {
      width: var(--size-14);
      height: var(--size-14);
    }

    &:focus {
      outline: var(--focus-ring);
    }

    &:not(:disabled):hover {
      background: var(--color-gray-alpha-100);
    }

    &:not(:disabled):active {
      background: var(--color-gray-alpha-200);
    }

    &:disabled {
      background-color: var(--color-gray-100);
      cursor: not-allowed;
    }
  }

  .error-overlay-toolbar-button-icon {
    color: var(--color-gray-900);
  }
`
