import type { DebugInfo } from '../../../../shared/types'
import { NodejsInspectorButton } from './nodejs-inspector-button'
import { CopyErrorButton } from './copy-error-button'
import { DocsLinkButton } from './docs-link-button'

type ErrorOverlayToolbarProps = {
  error: Error
  debugInfo: DebugInfo | undefined
  feedbackButton?: React.ReactNode
  generateErrorInfo: () => string
}

export function ErrorOverlayToolbar({
  error,
  debugInfo,
  feedbackButton,
  generateErrorInfo,
}: ErrorOverlayToolbarProps) {
  return (
    <span className="error-overlay-toolbar">
      {/* TODO: Move the button inside and remove the feedback on the footer of the error overlay.  */}
      {feedbackButton}
      <CopyErrorButton error={error} generateErrorInfo={generateErrorInfo} />
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
  .copy-error-button,
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
