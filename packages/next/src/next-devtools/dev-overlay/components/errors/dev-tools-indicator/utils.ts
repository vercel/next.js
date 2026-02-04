import { useEffect, useEffectEvent } from 'react'

export function useFocusTrap(
  rootRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null> | null,
  active: boolean,
  onOpenFocus?: () => void
) {
  const fireOpenFocus = useEffectEvent((rootNode: HTMLElement | null) => {
    if (onOpenFocus) {
      onOpenFocus()
    } else {
      rootNode?.focus()
    }
  })
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
        fireOpenFocus(rootNode)
        rootNode?.addEventListener('keydown', onTab)
      } else {
        const activeElement = getActiveElement(rootNode)
        // Only restore focus if the focus was previously on the content.
        // This avoids us accidentally focusing on mount when the
        // user could want to interact with their own app instead.
        if (triggerRef && rootNode?.contains(activeElement)) {
          triggerRef.current?.focus()
        }
      }
    })

    return () => {
      clearTimeout(id)
      rootNode?.removeEventListener('keydown', onTab)
    }
  }, [active, rootRef, triggerRef])
}

export function getActiveElement(node: HTMLElement | null) {
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

// TODO: split up escape and click outside logic
export function useClickOutsideAndEscape(
  rootRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  active: boolean,
  close: (reason: 'escape' | 'outside') => void,
  ownerDocument?: Document
) {
  useEffect(() => {
    if (!active) {
      return
    }

    const ownerDocumentEl = ownerDocument || rootRef.current?.ownerDocument

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (rootRef.current && rootRef.current.contains(target)) {
        return
      }

      const cushion = 10

      if (
        !(rootRef.current?.getBoundingClientRect()
          ? event.clientX >=
              rootRef.current.getBoundingClientRect()!.left - cushion &&
            event.clientX <=
              rootRef.current.getBoundingClientRect()!.right + cushion &&
            event.clientY >=
              rootRef.current.getBoundingClientRect()!.top - cushion &&
            event.clientY <=
              rootRef.current.getBoundingClientRect()!.bottom + cushion
          : false) &&
        !(triggerRef.current?.getBoundingClientRect()
          ? event.clientX >=
              triggerRef.current.getBoundingClientRect()!.left - cushion &&
            event.clientX <=
              triggerRef.current.getBoundingClientRect()!.right + cushion &&
            event.clientY >=
              triggerRef.current.getBoundingClientRect()!.top - cushion &&
            event.clientY <=
              triggerRef.current.getBoundingClientRect()!.bottom + cushion
          : false)
      ) {
        close('outside')
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close('escape')
      }
    }

    ownerDocumentEl?.addEventListener('mousedown', handleClickOutside)

    ownerDocumentEl?.addEventListener('keydown', handleKeyDown)

    return () => {
      ownerDocumentEl?.removeEventListener('mousedown', handleClickOutside)
      ownerDocumentEl?.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, close, ownerDocument, rootRef, triggerRef])
}

//////////////////////////////////////////////////////////////////////////////////////

export const MENU_DURATION_MS = 200
export const MENU_CURVE = 'cubic-bezier(0.175, 0.885, 0.32, 1.1)'
