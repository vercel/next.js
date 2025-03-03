import { useEffect } from 'react'

export function useFocusTrap(
  rootRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  active: boolean,
  onOpenFocus?: () => void
) {
  useEffect(() => {
    let rootNode: HTMLElement | null = null

    function onTab(e: KeyboardEvent) {
      if (e.key !== 'Tab' || rootNode === null) {
        return
      }

      const [firstFocusableNode, lastFocusableNode] =
        getFocusableNodes(rootNode)
      const activeElement = getActiveElement(rootNode)

      if (e.shiftKey) {
        if (activeElement === firstFocusableNode) {
          lastFocusableNode?.focus()
          e.preventDefault()
        }
      } else {
        if (activeElement === lastFocusableNode) {
          firstFocusableNode?.focus()
          e.preventDefault()
        }
      }
    }

    const id = setTimeout(() => {
      // Grab this on next tick to ensure the content is mounted
      rootNode = rootRef.current
      if (active) {
        if (onOpenFocus) {
          onOpenFocus()
        } else {
          rootNode?.focus()
        }
        rootNode?.addEventListener('keydown', onTab)
      } else {
        const activeElement = getActiveElement(rootNode)
        // Only restore focus if the focus was previously on the content.
        // This avoids us accidentally focusing on mount when the
        // user could want to interact with their own app instead.
        if (rootNode?.contains(activeElement)) {
          triggerRef.current?.focus()
        }
      }
    })

    return () => {
      clearTimeout(id)
      rootNode?.removeEventListener('keydown', onTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

function getActiveElement(node: HTMLElement | null) {
  const root = node?.getRootNode()
  return root instanceof ShadowRoot
    ? (root?.activeElement as HTMLElement)
    : null
}

function getFocusableNodes(node: HTMLElement): [HTMLElement, HTMLElement] | [] {
  const focusableElements = node.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  if (!focusableElements) return []
  return [
    focusableElements![0] as HTMLElement,
    focusableElements![focusableElements!.length - 1] as HTMLElement,
  ]
}

//////////////////////////////////////////////////////////////////////////////////////

export function useClickOutside(
  rootRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  active: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!active) {
      return
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        !(rootRef.current?.getBoundingClientRect()
          ? event.clientX >= rootRef.current.getBoundingClientRect()!.left &&
            event.clientX <= rootRef.current.getBoundingClientRect()!.right &&
            event.clientY >= rootRef.current.getBoundingClientRect()!.top &&
            event.clientY <= rootRef.current.getBoundingClientRect()!.bottom
          : false) &&
        !(triggerRef.current?.getBoundingClientRect()
          ? event.clientX >= triggerRef.current.getBoundingClientRect()!.left &&
            event.clientX <=
              triggerRef.current.getBoundingClientRect()!.right &&
            event.clientY >= triggerRef.current.getBoundingClientRect()!.top &&
            event.clientY <= triggerRef.current.getBoundingClientRect()!.bottom
          : false)
      ) {
        close()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
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

//////////////////////////////////////////////////////////////////////////////////////

export const MENU_DURATION_MS = 200
export const MENU_CURVE = 'cubic-bezier(0.175, 0.885, 0.32, 1.1)'
