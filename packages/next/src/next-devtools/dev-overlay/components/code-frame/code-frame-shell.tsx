import type { ReactNode } from 'react'
import { OpenInEditorButton } from '../open-in-editor-button'

type CodeFrameShellProps = {
  header: ReactNode
  onOpen?: () => void
  openLabel?: string
  children: ReactNode
}

export function CodeFrameShell({
  header,
  onOpen,
  openLabel,
  children,
}: CodeFrameShellProps) {
  return (
    <div data-nextjs-codeframe>
      <div className="code-frame-header">
        {/* TODO: This is <div> in `Terminal` component.
        Changing now will require multiple test snapshots updates.
        Leaving as <div> as is trivial and does not affect the UI.
        Change when the new redbox matcher `toDisplayRedbox` is used. */}
        <p className="code-frame-link">
          {header}
          {onOpen && (
            <OpenInEditorButton
              aria-label={openLabel}
              data-with-open-in-editor-link-source-file
              onClick={onOpen}
            />
          )}
        </p>
      </div>
      <pre className="code-frame-pre">
        <div className="code-frame-lines">{children}</div>
      </pre>
    </div>
  )
}
