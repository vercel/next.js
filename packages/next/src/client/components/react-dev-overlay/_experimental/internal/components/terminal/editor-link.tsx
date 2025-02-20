import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { noop as css } from '../../helpers/noop-template'

type EditorLinkProps = {
  file: string
  isSourceFile: boolean
  location?: {
    line: number
    column: number
  }
}
export function EditorLink({ file, location }: EditorLinkProps) {
  const open = useOpenInEditor({
    file,
    lineNumber: location?.line ?? 1,
    column: location?.column ?? 0,
  })

  return (
    <div
      data-with-open-in-editor-link
      data-with-open-in-editor-link-import-trace
      tabIndex={10}
      role={'link'}
      onClick={open}
      title={'Click to open in your editor'}
    >
      {file}
      {location ? `:${location.line}:${location.column}` : null}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    </div>
  )
}

export const EDITOR_LINK_STYLES = css`
  [data-with-open-in-editor-link] svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);
  }
  [data-with-open-in-editor-link] {
    cursor: pointer;
  }
  [data-with-open-in-editor-link]:hover {
    text-decoration: underline dotted;
  }
  [data-with-open-in-editor-link-import-trace] {
    margin-left: var(--size-gap-double);
  }
`
