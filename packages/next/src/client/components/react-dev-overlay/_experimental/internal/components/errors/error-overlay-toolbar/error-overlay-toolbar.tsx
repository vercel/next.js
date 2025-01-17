import type { DebugInfo } from '../../../../../types'
import { NodejsInspectorButton } from './nodejs-inspector-button'
import { noop as css } from '../../../helpers/noop-template'
import { CopyStackTraceButton } from './copy-stack-trace-button'
import { DocsLinkButton } from './docs-link-button'

type ErrorOverlayToolbarProps = {
  error: Error | undefined
  debugInfo: DebugInfo | undefined
}

export function ErrorOverlayToolbar({
  error,
  debugInfo,
}: ErrorOverlayToolbarProps) {
  return (
    <span className="error-overlay-toolbar">
      <CopyStackTraceButton error={error} />
      <NodejsInspectorButton
        devtoolsFrontendUrl={debugInfo?.devtoolsFrontendUrl}
      />
      <DocsLinkButton errorMessage={error?.message || ''} />
    </span>
  )
}

export const styles = css`
  .error-overlay-toolbar {
    display: flex;
    gap: var(--size-1_5);
  }

  .nodejs-inspector-button,
  .copy-stack-trace-button,
  .docs-link-button {
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

    &:not(:disabled):hover {
      background: var(--color-gray-alpha-100);
    }

    &:not(:disabled):active {
      background: var(--color-gray-alpha-200);
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  .error-overlay-toolbar-button-icon {
    color: var(--color-gray-900);
  }
`
