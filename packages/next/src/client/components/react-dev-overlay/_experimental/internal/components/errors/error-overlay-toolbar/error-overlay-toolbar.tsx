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
    gap: 6px;
  }

  .nodejs-inspector-button,
  .copy-stack-trace-button,
  .docs-link-button {
    display: flex;
    justify-content: center;
    align-items: center;

    width: var(--size-32px);
    height: var(--size-32px);
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    svg {
      width: var(--size-16px);
      height: var(--size-16px);
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
      cursor: not-allowed;
    }
  }

  .error-overlay-toolbar-button-icon {
    color: var(--color-gray-900);
  }
`
