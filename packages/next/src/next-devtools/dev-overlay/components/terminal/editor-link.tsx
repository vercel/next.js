import { OpenInEditorButton } from '../open-in-editor-button'
import { useOpenInEditor } from '../../utils/use-open-in-editor'

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
    line1: location?.line ?? 1,
    column1: location?.column ?? 1,
  })

  return (
    <div
      data-with-open-in-editor-link
      data-with-open-in-editor-link-import-trace
    >
      <span>
        {file}
        {location ? `:${location.line}:${location.column}` : null}
      </span>
      <OpenInEditorButton
        onClick={open}
        aria-label={`Open ${file} in editor`}
      />
    </div>
  )
}

export const EDITOR_LINK_STYLES = `
  [data-with-open-in-editor-link] {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  [data-with-open-in-editor-link-import-trace] {
    margin-left: 16px;
  }
`
