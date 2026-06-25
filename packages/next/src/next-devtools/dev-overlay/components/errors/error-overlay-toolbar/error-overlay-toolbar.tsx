import type { DebugInfo } from '../../../../shared/types'
import { NodejsInspectorButton } from './nodejs-inspector-button'
import { CopyErrorButton } from './copy-error-button'
import { DocsLinkButton } from './docs-link-button'

type ErrorOverlayToolbarProps = {
  error: Error
  debugInfo: DebugInfo | undefined
  feedbackButton?: React.ReactNode
  generateErrorInfo: () => Promise<string>
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
        key={debugInfo?.devtoolsFrontendUrl}
        defaultDevtoolsFrontendUrl={debugInfo?.devtoolsFrontendUrl}
      />
    </span>
  )
}

export const styles = `
  .error-overlay-toolbar {
    display: flex;
    gap: 6px;
  }

  @media (max-width: 575px) {
    .error-overlay-toolbar {
      gap: 4px;
    }
  }

  .nodejs-inspector-button,
  .copy-error-button,
  .docs-link-button {
    display: flex;
    justify-content: center;
    align-items: center;

    width: var(--size-24);
    height: var(--size-24);
    background: none;
    border: none;
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
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .nodejs-inspector-button[data-pending='true'] {
    cursor: wait;
  }

  .error-overlay-toolbar-button-icon {
    color: var(--color-gray-900);
  }
`
