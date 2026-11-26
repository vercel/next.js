import { createContext, useContext } from 'react'
import { ContextMenu } from '@base-ui-components/react/context-menu'

export const CopyErrorContext = createContext<(error: string | null) => void>(
  () => {}
)

export function RequestContextMenuItem({
  getValue,
  label,
}: {
  getValue: () => string
  label: string
}) {
  const setCopyError = useContext(CopyErrorContext)

  return (
    <ContextMenu.Item
      className="request-insights-context-item"
      onClick={async () => {
        setCopyError(null)
        if (!navigator.clipboard) {
          setCopyError('Copy is unavailable. Use HTTPS or localhost.')
          return
        }
        try {
          await navigator.clipboard.writeText(getValue())
        } catch {
          setCopyError(
            'Could not copy. Check browser permissions and try again.'
          )
        }
      }}
    >
      {label}
    </ContextMenu.Item>
  )
}

export function RequestInsightsContextMenuBackdrop({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <ContextMenu.Backdrop
      className="request-insights-context-backdrop"
      onPointerDown={onClose}
    />
  )
}
