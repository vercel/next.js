import { useCallback } from 'react'
import { ExternalIcon } from '../../icons/external'
import { FileIcon } from '../../icons/file'
import { css } from '../../utils/css'

type UnrenderedSegmentInfoProps = {
  route: string
  files: string[]
}

/**
 * Visual replacement for the code-frame on the unrendered-segment overlay.
 * The error has no source location to point at, but we know the route
 * the user navigated to and the segment file(s) the framework expected to
 * render. We surface both with the same chrome as `CodeFrame` so they
 * read as "real code locations" — the route as a navigation context pill,
 * each segment file as a clickable open-in-editor pill with a body slot
 * that explains why there is no source content to display.
 */
export function UnrenderedSegmentInfo({
  route,
  files,
}: UnrenderedSegmentInfoProps) {
  return (
    <div data-nextjs-unrendered-segment-list>
      <UnrenderedSegmentRoute route={route} />
      {files.map((file) => (
        <UnrenderedSegmentFile key={file} file={file} />
      ))}
    </div>
  )
}

function UnrenderedSegmentRoute({ route }: { route: string }) {
  return (
    <div data-nextjs-unrendered-segment-card>
      <div data-nextjs-unrendered-segment-card-header>
        <p data-nextjs-unrendered-segment-card-link>
          <span data-nextjs-unrendered-segment-card-label>Route</span>
          <span data-text>{route}</span>
        </p>
      </div>
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
      <div data-nextjs-unrendered-segment-card-header>
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
      <pre data-nextjs-unrendered-segment-card-body>
        <span data-nextjs-unrendered-segment-card-body-text>
          This segment did not render.
        </span>
      </pre>
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

  /* Mirrors \`[data-nextjs-codeframe]\` chrome so the path pills read as
     real code locations even though there's no source to render. */
  [data-nextjs-unrendered-segment-card] {
    background-color: var(--color-background-200);
    color: var(--color-gray-1000);
    text-overflow: ellipsis;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-13);
    line-height: var(--size-20);
    margin: 0;
    overflow: hidden;
  }

  [data-nextjs-unrendered-segment-card] svg {
    width: var(--size-16);
    height: var(--size-16);
  }

  [data-nextjs-unrendered-segment-card-header] {
    width: 100%;
    border-radius: var(--rounded-lg) var(--rounded-lg) 0 0;
  }

  [data-nextjs-unrendered-segment-card-link] {
    align-items: center;
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 12px;
  }

  [data-nextjs-unrendered-segment-card-icon] {
    display: inline-flex;
    flex-shrink: 0;
  }

  [data-nextjs-unrendered-segment-card-label] {
    color: var(--color-gray-900);
    flex-shrink: 0;
    font-family: var(--font-stack-sans);
    font-size: var(--size-12);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
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

  /* Body slot mirrors \`.code-frame-pre\` so the unrendered-segment card
     reads as a code-frame with an empty (greyed-out) source area. */
  [data-nextjs-unrendered-segment-card-body] {
    background: var(--color-background-100) !important;
    border: 1px solid var(--color-gray-200);
    border-bottom: none;
    border-radius: var(--rounded-xl);
    color: var(--color-gray-800);
    font-style: italic;
    margin: 0;
    margin-left: -1px !important;
    padding: 12px;
    width: calc(100% + 2px);
    max-width: calc(100% + 2px) !important;
  }

  [data-nextjs-unrendered-segment-card-body-text] {
    font-family: var(--font-stack-monospace);
    font-size: var(--size-12);
  }
`
