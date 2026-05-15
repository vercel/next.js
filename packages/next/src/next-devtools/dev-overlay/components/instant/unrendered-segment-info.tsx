import { useCallback } from 'react'
import { ExternalIcon } from '../../icons/external'
import { FileIcon } from '../../icons/file'
import { css } from '../../utils/css'

type UnrenderedSegmentInfoProps = {
  files: string[]
}

/**
 * Visual replacement for the code-frame on the unrendered-segment overlay.
 * The error has no source location to point at, but we know which segment
 * file(s) the framework expected to render. We surface them with the same
 * chrome as `CodeFrame` so each one reads as a clickable "open in editor"
 * pill, mirroring how source frames behave elsewhere in the overlay.
 *
 * Per Josh's design framing: the route name is junk visual context here
 * (it's still in the underlying `error.message` for CLI consumers) — the
 * segment file is what the user actually needs to navigate to.
 */
export function UnrenderedSegmentInfo({ files }: UnrenderedSegmentInfoProps) {
  if (files.length === 0) return null
  return (
    <div data-nextjs-unrendered-segment-list>
      {files.map((file) => (
        <UnrenderedSegmentFile key={file} file={file} />
      ))}
    </div>
  )
}

function UnrenderedSegmentFile({ file }: { file: string }) {
  const open = useCallback(() => {
    const params = new URLSearchParams()
    params.append('file', file)
    self
      .fetch(
        `${
          process.env.__NEXT_ROUTER_BASEPATH || ''
        }/__nextjs_launch-editor?${params.toString()}`
      )
      .then(
        () => {},
        (cause) => {
          console.error(
            `Failed to open file "${file}" in your editor. Cause:`,
            cause
          )
        }
      )
  }, [file])

  const fileExtension = file.split('.').pop()

  return (
    <div data-nextjs-unrendered-segment-card>
      <p data-nextjs-unrendered-segment-card-link>
        <span data-nextjs-unrendered-segment-card-icon>
          <FileIcon lang={fileExtension} />
        </span>
        <span data-text>{file}</span>
        <button
          aria-label={`Open ${file} in editor`}
          data-with-open-in-editor-link-source-file
          onClick={open}
          type="button"
        >
          <ExternalIcon />
        </button>
      </p>
    </div>
  )
}

export const UNRENDERED_SEGMENT_INFO_STYLES = css`
  [data-nextjs-unrendered-segment-list] {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;
  }

  [data-nextjs-unrendered-segment-card] {
    background-color: var(--color-background-200);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    color: var(--color-gray-1000);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-13);
    overflow: hidden;
  }

  [data-nextjs-unrendered-segment-card-link] {
    align-items: center;
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 12px;
    transition: background 100ms ease-out;
  }

  [data-nextjs-unrendered-segment-card-icon] {
    display: inline-flex;
    flex-shrink: 0;
  }

  [data-nextjs-unrendered-segment-card-icon] svg {
    width: var(--size-16);
    height: var(--size-16);
  }

  [data-nextjs-unrendered-segment-card-link] [data-text] {
    flex: 1;
    font-size: var(--size-12);
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`
