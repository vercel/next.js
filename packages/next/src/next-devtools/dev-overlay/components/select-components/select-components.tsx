import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  ContextMenuAction,
  OverlayBounds,
  ReactGrabRendererHandle,
  ReactGrabRendererProps,
} from '../../../../compiled/react-grab-frontend'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import {
  clearComponentSelection,
  connectSelectionTool,
  getSelectionContext,
  pruneComponentSelection,
  removeComponent,
  startSelectingComponents,
  stopSelectingComponents,
  toggleComponent,
  useComponentSelection,
} from './selection-store'
import { REACT_GRAB_THEME } from './react-grab-theme'

function pageElement(event: Event): Element | null {
  const path = event.composedPath()
  if (
    path.some(
      (node) =>
        node instanceof Element &&
        (node.tagName === 'NEXTJS-PORTAL' ||
          node.hasAttribute('data-react-grab-ignore-events') ||
          node.hasAttribute('data-react-grab-frontend'))
    )
  ) {
    return null
  }
  const target = path.find((node): node is Element => node instanceof Element)
  return target &&
    target !== document.documentElement &&
    target !== document.body
    ? target
    : null
}

function getBounds(element: Element): OverlayBounds {
  const { x, y, width, height } = element.getBoundingClientRect()
  return {
    x,
    y,
    width,
    height,
    borderRadius: getComputedStyle(element).borderRadius,
  }
}

export function SelectComponents() {
  const { state: overlayState } = useDevOverlayContext()
  const { selecting, selections, sharing } = useComponentSelection()
  const [hovered, setHovered] = useState<Element | null>(null)
  const [copyResult, setCopyResult] = useState<{
    selections: typeof selections
    status: 'copied' | 'error'
  } | null>(null)
  const copyState =
    copyResult?.selections === selections ? copyResult.status : 'idle'
  const [menu, setMenu] = useState<OverlayBounds | null>(null)
  const menuRef = useRef(menu)
  const [, redraw] = useState(0)
  const hostRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<ReactGrabRendererHandle | null>(null)
  const visible = selecting || selections.length > 0

  useEffect(
    () => connectSelectionTool(overlayState.routerType === 'app'),
    [overlayState.routerType]
  )

  useEffect(() => {
    if (!selecting) return
    function move(event: PointerEvent) {
      setHovered(pageElement(event))
    }
    function capture(event: Event) {
      if (!pageElement(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    function pick(event: MouseEvent) {
      const target = pageElement(event)
      if (!target) return
      capture(event)
      toggleComponent(target)
    }
    function keydown(event: KeyboardEvent) {
      // Let the renderer dismiss its menu before exiting selection mode.
      if (event.key !== 'Escape' || menuRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      stopSelectingComponents()
    }
    const blockedEvents = [
      'pointerdown',
      'pointerup',
      'mousedown',
      'mouseup',
      'dblclick',
      'contextmenu',
    ]
    for (const name of blockedEvents)
      window.addEventListener(name, capture, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('click', pick, true)
    window.addEventListener('keydown', keydown, true)
    return () => {
      for (const name of blockedEvents)
        window.removeEventListener(name, capture, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('click', pick, true)
      window.removeEventListener('keydown', keydown, true)
      setHovered(null)
    }
  }, [selecting])

  useEffect(() => {
    if (!visible) return
    let frame = 0
    function refresh() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        pruneComponentSelection()
        redraw((version) => version + 1)
      })
    }
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    const resize = new ResizeObserver(refresh)
    for (const { element } of selections) resize.observe(element)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resize.disconnect()
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [visible, selections])

  const closeMenu = () => {
    setMenu(null)
    // The upstream menu cannot restore a focus target in our nested shadow root.
    // Restore its trigger when the menu itself owns focus.
    if (
      hostRef.current?.shadowRoot?.activeElement?.closest(
        '[data-react-grab-context-menu]'
      )
    ) {
      toolbarRef.current
        ?.querySelector<HTMLButtonElement>('[data-react-grab-toolbar-toggle]')
        ?.focus({ preventScroll: true })
    }
  }
  const actions: ContextMenuAction[] = [
    {
      id: 'select',
      label: selecting ? 'Done selecting' : 'Select more',
      onAction: () => {
        if (selecting) stopSelectingComponents()
        else startSelectingComponents()
        closeMenu()
      },
    },
    {
      id: 'copy',
      label:
        copyState === 'copied'
          ? 'Copied context'
          : copyState === 'error'
            ? 'Retry copy'
            : 'Copy context',
      enabled: selections.length > 0,
      onAction: async () => {
        try {
          await navigator.clipboard.writeText(
            JSON.stringify(await getSelectionContext(), null, 2)
          )
          setCopyResult({ selections, status: 'copied' })
        } catch {
          setCopyResult({ selections, status: 'error' })
        }
      },
    },
    ...selections.map(({ id }) => ({
      id: `remove-${id}`,
      label: `Remove component ${id}`,
      onAction: () => {
        removeComponent(id)
        closeMenu()
      },
    })),
    {
      id: 'clear',
      label: 'Clear selection',
      enabled: selections.length > 0,
      onAction: () => {
        clearComponentSelection()
        closeMenu()
      },
    },
  ]
  const entries = selections
    .filter(({ element }) => element.isConnected)
    .map(({ element, id, context }) => ({
      bounds: getBounds(element),
      tagName: `#${id} ${context?.name || element.localName}`,
    }))
  const preview =
    selecting &&
    hovered?.isConnected &&
    !selections.some(({ element }) => element === hovered)
      ? { bounds: getBounds(hovered), tagName: 'Click to select' }
      : undefined
  const rendererProps: ReactGrabRendererProps = {
    selectionVisible: entries.length > 0 || !!preview,
    selectionBoundsMultiple: [
      ...entries.map(({ bounds }) => bounds),
      ...(preview ? [preview.bounds] : []),
    ],
    selectionLabelVisible: true,
    frozenLabelEntryAccessors: entries.map((entry) => ({ read: () => entry })),
    pendingShiftPreviewEntry: preview,
    toolbarVisible: visible,
    enabled: true,
    isActive: selecting,
    defaultActionId: 'select-components',
    activeActionId: 'select-components',
    defaultActionLabel: 'Select',
    onToggleActive: selecting
      ? stopSelectingComponents
      : startSelectingComponents,
    onToolbarRef: (element) => {
      toolbarRef.current = element
    },
    onToggleToolbarMenu: () => {
      const toolbar = toolbarRef.current
      if (toolbar) setMenu((current) => (current ? null : getBounds(toolbar)))
    },
    contextMenuPosition: menu
      ? { x: menu.x + menu.width / 2, y: menu.y }
      : null,
    contextMenuBounds: menu,
    contextMenuTagName: `${selections.length} selected · ${sharing === 'available' ? 'Shared with agents' : 'Copy to share'}`,
    actions,
    actionContext: visible
      ? {
          element: selections[0]?.element ?? document.body,
          elements: selections.map(({ element }) => element),
          hooks: {
            onOpenFile: () => false,
            transformOpenFileUrl: (url) => url,
            transformHtmlContent: async (html) => html,
          },
          performWithFeedback: async (action) => {
            await action()
          },
          hideContextMenu: closeMenu,
          cleanup: closeMenu,
        }
      : undefined,
    onContextMenuDismiss: closeMenu,
    onContextMenuHide: closeMenu,
  }
  const propsRef = useRef(rendererProps)

  useEffect(() => {
    const host = hostRef.current
    if (!visible || !host) return
    // The upstream Solid renderer evaluates DOM templates on import. Load it only
    // in the browser. Its Fiber instrumentation is excluded from this bundle.
    const frontend =
      require('../../../../compiled/react-grab-frontend') as typeof import('../../../../compiled/react-grab-frontend')
    // Isolate the renderer's reset while inheriting Next's theme custom properties.
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const overlayRoot = host.getRootNode()
    const returnFocus =
      overlayRoot instanceof ShadowRoot
        ? overlayRoot.querySelector<HTMLButtonElement>(
            '[data-nextjs-dev-tools-button]'
          )
        : null
    const style = document.createElement('style')
    const nonce =
      document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce
    if (nonce) style.nonce = nonce
    style.textContent = frontend.styles + REACT_GRAB_THEME
    const root = document.createElement('div')
    root.setAttribute('data-react-grab', '')
    shadow.append(style, root)
    // Track focus before React detaches the host; activeElement is already lost
    // by the time passive-effect cleanup runs for a removed shadow tree.
    let focusWithin = false
    const onFocusIn = () => {
      focusWithin = true
    }
    const onFocusOut = (event: FocusEvent) => {
      focusWithin =
        event.relatedTarget instanceof Node &&
        shadow.contains(event.relatedTarget)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const toolbar = toolbarRef.current
      if (
        !toolbar?.contains(shadow.activeElement) ||
        !(
          event.key === 'ContextMenu' ||
          (event.key === 'F10' && event.shiftKey)
        )
      ) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      setMenu(getBounds(toolbar))
    }
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    root.addEventListener('keydown', onKeyDown)
    const renderer = frontend.mountReactGrabRenderer(root, propsRef.current)
    rendererRef.current = renderer
    const toggle = root.querySelector<HTMLButtonElement>(
      '[data-react-grab-toolbar-toggle]'
    )
    if (toggle) {
      toggle.title = 'Right-click or press Shift+F10 for selection actions'
      toggle.setAttribute('aria-haspopup', 'menu')
      toggle.focus({ preventScroll: true })
    }
    return () => {
      const shouldRestoreFocus = focusWithin || shadow.activeElement !== null
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('keydown', onKeyDown)
      renderer.dispose()
      rendererRef.current = null
      toolbarRef.current = null
      shadow.replaceChildren()
      if (shouldRestoreFocus && returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true })
      }
    }
  }, [visible])

  useLayoutEffect(() => {
    menuRef.current = menu
    propsRef.current = rendererProps
    rendererRef.current?.update(rendererProps)
  })

  if (!visible) return null
  return (
    <div
      ref={hostRef}
      data-nextjs-component-selection
      data-react-grab-frontend
      data-rg-theme="next"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2147483647,
      }}
    />
  )
}
