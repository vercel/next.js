import { useEffect } from 'react'

export function useFocusTrap(
  contentRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  active: boolean,
  onOpenFocus?: () => void
) {
  useEffect(() => {
    setTimeout(() => {
      if (active) {
        if (onOpenFocus) {
          onOpenFocus()
        } else {
          contentRef.current?.focus()
        }
      } else {
        // We only want to return back to the trigger
        // in case any other overlays aren't opened.
        const root = triggerRef.current?.getRootNode()
        const activeElement =
          root instanceof ShadowRoot
            ? (root?.activeElement as HTMLElement)
            : null
        // Only restore focus if the focus was previously on the content.
        // This avoids us accidentally focusing on mount when the
        // user could want to interact with their own app instead.
        if (contentRef.current?.contains(activeElement)) {
          triggerRef.current?.focus()
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

//////////////////////////////////////////////////////////////////////////////////////

export function useClickOutside(
  contentRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  active: boolean,
  closecontent: () => void
) {
  useEffect(() => {
    if (!active) {
      return
    }

    // Close content when clicking outside of it or its button
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !(contentRef.current?.getBoundingClientRect()
          ? event.clientX >= contentRef.current.getBoundingClientRect()!.left &&
            event.clientX <=
              contentRef.current.getBoundingClientRect()!.right &&
            event.clientY >= contentRef.current.getBoundingClientRect()!.top &&
            event.clientY <= contentRef.current.getBoundingClientRect()!.bottom
          : false) &&
        !(triggerRef.current?.getBoundingClientRect()
          ? event.clientX >= triggerRef.current.getBoundingClientRect()!.left &&
            event.clientX <=
              triggerRef.current.getBoundingClientRect()!.right &&
            event.clientY >= triggerRef.current.getBoundingClientRect()!.top &&
            event.clientY <= triggerRef.current.getBoundingClientRect()!.bottom
          : false)
      ) {
        closecontent()
      }
    }

    // Close popover when pressing escape
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closecontent()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

export const MENU_DURATION_MS = 200
export const MENU_CURVE = 'cubic-bezier(0.175, 0.885, 0.32, 1.1)'
