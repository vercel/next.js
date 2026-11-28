'use client'

import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type IframeHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import ReactDOM, { createPortal } from 'react-dom'

export type IframePlaceholder =
  | ReactNode
  | { image: string; alt?: string }
  | { url: string; title?: string }

export type IframePipCorner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type IframePipOptions = {
  /** Width of the floating window in pixels. Defaults to 320. */
  width?: number
  /** Corner the window starts in before it is dragged. Defaults to 'bottom-right'. */
  initialPosition?: IframePipCorner
  /** Allow resizing the window from its corners. Defaults to true. */
  resizable?: boolean
  /** Smallest width the window can be resized to, in pixels. Defaults to 200. */
  minWidth?: number
  /** Largest width the window can be resized to, in pixels. Defaults to the viewport width. */
  maxWidth?: number
  /**
   * Show a button that moves the iframe into an always-on-top system window
   * using the Document Picture-in-Picture API. Hidden in browsers without it.
   * The embedded page reloads when it moves in or out. Defaults to true.
   */
  popOut?: boolean
}

export type IframeProps = Omit<
  ComponentPropsWithoutRef<'iframe'>,
  'height' | 'loading' | 'placeholder' | 'style' | 'title' | 'width'
> & {
  title: string
  width?: IframeHTMLAttributes<HTMLIFrameElement>['width']
  height?: IframeHTMLAttributes<HTMLIFrameElement>['height']
  aspectRatio?: CSSProperties['aspectRatio']
  fill?: boolean
  loading?: IframeHTMLAttributes<HTMLIFrameElement>['loading']
  style?: CSSProperties
  /**
   * Shown on top of the iframe until it fires `load`. Pass any React node
   * (text, a component), `{ image }` for an image, or `{ url }` for another page.
   */
  placeholder?: IframePlaceholder
  /** Render the iframe in a floating window that can be dragged and resized. */
  pipDraggable?: boolean | IframePipOptions
  /** Block pointer, keyboard and assistive-technology interaction with the embedded page. */
  disableEvents?: boolean
  /**
   * When to create the iframe. `'click'` renders a lightweight facade, the
   * placeholder plus a load button, and only loads the embedded page once the
   * user activates it. The connection is warmed up on hover or focus.
   * Defaults to `'auto'`.
   */
  loadOn?: 'auto' | 'click'
}

const PIP_DEFAULT_WIDTH = 320
const PIP_DEFAULT_MIN_WIDTH = 200
const PIP_MARGIN = 16
const PIP_HANDLE_HEIGHT = 28
const PIP_GRIP_SIZE = 12
const PIP_KEYBOARD_STEP = 10
const PIP_CORNERS: IframePipCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

type Point = { x: number; y: number }
type Size = { width: number; height: number }
type Rect = { left: number; top: number; right: number; bottom: number } & Size

type PipGesture = {
  pointerId: number
  start: Point
  rect: Rect
  // Set when resizing from a corner, undefined when moving.
  corner?: IframePipCorner
}

type DocumentPictureInPicture = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}

function getDocumentPictureInPicture(): DocumentPictureInPicture | undefined {
  return (
    window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }
  ).documentPictureInPicture
}

// The picture-in-picture window starts as an empty document, so copy the
// page's styles over for placeholders that rely on them.
function copyStyleSheets(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style')
      style.textContent = Array.from(
        sheet.cssRules,
        (rule) => rule.cssText
      ).join('\n')
      target.head.appendChild(style)
    } catch {
      // Cross-origin stylesheets can't be read, so link to them instead.
      if (sheet.href) {
        const link = target.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.head.appendChild(link)
      }
    }
  }
}

function getViewportSize(): Size {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }
}

function clampToViewport(point: Point, size: Size): Point {
  const viewport = getViewportSize()
  return {
    x: Math.min(Math.max(0, point.x), Math.max(0, viewport.width - size.width)),
    y: Math.min(
      Math.max(0, point.y),
      Math.max(0, viewport.height - size.height)
    ),
  }
}

const titleBarButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: 0,
  border: 0,
  font: 'inherit',
  fontSize: 12,
  color: 'CanvasText',
  background: 'transparent',
}

function getResizeCursor(corner: IframePipCorner) {
  return corner === 'top-left' || corner === 'bottom-right'
    ? 'nwse-resize'
    : 'nesw-resize'
}

/**
 * Resizes from `corner` while the opposite corner stays in place. The frame
 * keeps its aspect ratio, so only the width is computed and the height follows.
 */
function resizeFromCorner(
  gesture: PipGesture & { corner: IframePipCorner },
  pointer: Point,
  minWidth: number,
  maxWidth: number
): { width: number; offset: Point } {
  const { rect, corner, start } = gesture
  const growsLeft = corner.endsWith('left')
  const growsUp = corner.startsWith('top')
  // Height of the frame per pixel of width.
  const frameRatio = (rect.height - PIP_HANDLE_HEIGHT) / rect.width

  const dx = (pointer.x - start.x) * (growsLeft ? -1 : 1)
  const dy = (pointer.y - start.y) * (growsUp ? -1 : 1)
  // Follow whichever axis the pointer moved further along, in width units.
  const dWidth =
    Math.abs(dx) >= Math.abs(dy / frameRatio) ? dx : dy / frameRatio

  const viewport = getViewportSize()
  const spaceX = growsLeft ? rect.right : viewport.width - rect.left
  const spaceY = growsUp ? rect.bottom : viewport.height - rect.top
  const upper = Math.min(
    maxWidth,
    spaceX,
    (spaceY - PIP_HANDLE_HEIGHT) / frameRatio
  )
  const width = Math.max(
    Math.min(rect.width + dWidth, upper),
    Math.min(minWidth, upper)
  )
  const height = PIP_HANDLE_HEIGHT + width * frameRatio

  return {
    width,
    offset: {
      x: growsLeft ? rect.right - width : rect.left,
      y: growsUp ? rect.bottom - height : rect.top,
    },
  }
}

// Height an iframe falls back to when nothing else sizes it.
function getIntrinsicHeight(
  height: IframeHTMLAttributes<HTMLIFrameElement>['height']
) {
  if (height === undefined) return 150
  return Number.isNaN(Number(height)) ? height : Number(height)
}

function isPlaceholderObject(
  placeholder: IframePlaceholder
): placeholder is { image: string; alt?: string } | { url: string } {
  return (
    typeof placeholder === 'object' &&
    placeholder !== null &&
    !isValidElement(placeholder) &&
    ('image' in placeholder || 'url' in placeholder)
  )
}

function renderPlaceholder(placeholder: IframePlaceholder, title: string) {
  const fillStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    border: 0,
    display: 'block',
  }

  if (isPlaceholderObject(placeholder)) {
    if ('image' in placeholder) {
      return (
        <img
          src={placeholder.image}
          alt={placeholder.alt ?? ''}
          style={{ ...fillStyle, objectFit: 'cover' }}
        />
      )
    }
    return (
      <iframe
        src={placeholder.url}
        title={placeholder.title ?? `${title} (loading)`}
        style={fillStyle}
      />
    )
  }

  return (
    <div
      style={{
        ...fillStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {placeholder}
    </div>
  )
}

export default function Iframe({
  aspectRatio,
  disableEvents = false,
  fill = false,
  height,
  loadOn = 'auto',
  loading = 'lazy',
  onLoad,
  pipDraggable = false,
  placeholder,
  src,
  srcDoc,
  style,
  tabIndex,
  title,
  width,
  ...props
}: IframeProps) {
  const resolvedAspectRatio =
    aspectRatio ?? (width && height ? `${width} / ${height}` : undefined)
  const hasPlaceholder = placeholder !== undefined && placeholder !== null
  const isPip = pipDraggable !== false
  const pipOptions = typeof pipDraggable === 'object' ? pipDraggable : {}
  const pipResizable = pipOptions.resizable ?? true
  const pipMinWidth = pipOptions.minWidth ?? PIP_DEFAULT_MIN_WIDTH
  const pipMaxWidth = pipOptions.maxWidth ?? Infinity
  const pipPopOut = pipOptions.popOut ?? true

  const wrapperRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const gestureRef = useRef<PipGesture | null>(null)
  const focusOnActivateRef = useRef(false)

  // A load event that fires before hydration can't be observed, so when a
  // placeholder is shown the source is only assigned once mounted.
  const [isMounted, setIsMounted] = useState(false)
  const [loadedSource, setLoadedSource] = useState<string | undefined>()
  const [pipOffset, setPipOffset] = useState<Point | null>(null)
  const [pipWidth, setPipWidth] = useState<number | null>(null)
  const [activeGesture, setActiveGesture] = useState<
    'move' | IframePipCorner | null
  >(null)
  const [canPopOut, setCanPopOut] = useState(false)
  const [popOutWindow, setPopOutWindow] = useState<Window | null>(null)
  const [isActivated, setIsActivated] = useState(false)

  const source = src ?? srcDoc
  const isLoaded = loadedSource !== undefined && loadedSource === source
  const isFrameActive = loadOn !== 'click' || isActivated
  const showPlaceholder = hasPlaceholder && isFrameActive && !isLoaded
  const assignSource = !hasPlaceholder || isMounted
  const gestureCursor =
    activeGesture === 'move'
      ? 'grabbing'
      : activeGesture
        ? getResizeCursor(activeGesture)
        : undefined

  useEffect(() => {
    setIsMounted(true)
    setCanPopOut(getDocumentPictureInPicture() !== undefined)
  }, [])

  // `inert` is set as a DOM property because React 18 and 19 disagree on how
  // the attribute is serialized. Popping out remounts the iframe, so rerun then.
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.inert = disableEvents
    }
  }, [disableEvents, popOutWindow])

  // Move focus into the page the user just asked to load.
  useEffect(() => {
    if (!isActivated || !focusOnActivateRef.current) return
    focusOnActivateRef.current = false
    if (!disableEvents) iframeRef.current?.focus()
  }, [isActivated, disableEvents])

  // Close the system window when the component unmounts.
  useEffect(() => {
    if (!popOutWindow) return
    return () => popOutWindow.close()
  }, [popOutWindow])

  useEffect(() => {
    if (!isPip) return
    const onResize = () => {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const viewport = getViewportSize()
      setPipWidth((current) =>
        current === null ? current : Math.min(current, viewport.width)
      )
      setPipOffset(
        (offset) =>
          offset && clampToViewport(offset, wrapper.getBoundingClientRect())
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isPip])

  const handleLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    // Ignore the initial about:blank load of an iframe that has no source yet.
    const iframe = event.currentTarget
    if (iframe.hasAttribute('src') || iframe.hasAttribute('srcdoc')) {
      setLoadedSource(source)
    }
    onLoad?.(event)
  }

  // Open the connection to the embedded origin before the user commits.
  const warmConnection = () => {
    if (!src || !ReactDOM.preconnect) return
    try {
      const { origin } = new URL(src, window.location.href)
      if (origin !== 'null' && origin !== window.location.origin) {
        ReactDOM.preconnect(origin)
      }
    } catch {}
  }

  const activate = () => {
    focusOnActivateRef.current = true
    setIsActivated(true)
  }

  const openPopOut = async () => {
    const documentPictureInPicture = getDocumentPictureInPicture()
    const wrapper = wrapperRef.current
    if (!documentPictureInPicture || !wrapper) return
    const rect = wrapper.getBoundingClientRect()

    let pipWindow: Window
    try {
      pipWindow = await documentPictureInPicture.requestWindow({
        width: Math.round(rect.width),
        height: Math.round(rect.height - PIP_HANDLE_HEIGHT),
      })
    } catch {
      return
    }

    copyStyleSheets(pipWindow.document)
    pipWindow.document.title = title
    pipWindow.document.body.style.margin = '0'
    pipWindow.addEventListener(
      'pagehide',
      () => {
        // The iframe reloads back in the page, so show the placeholder again.
        setLoadedSource(undefined)
        setPopOutWindow(null)
      },
      { once: true }
    )
    setLoadedSource(undefined)
    setPopOutWindow(pipWindow)
  }

  const moveBy = (dx: number, dy: number) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    setPipOffset(clampToViewport({ x: rect.left + dx, y: rect.top + dy }, rect))
  }

  // Resizes around the top-left corner, shifting back on screen if needed.
  const resizeBy = (dWidth: number) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const viewport = getViewportSize()
    const frameRatio = (rect.height - PIP_HANDLE_HEIGHT) / rect.width
    const upper = Math.min(
      pipMaxWidth,
      viewport.width,
      (viewport.height - PIP_HANDLE_HEIGHT) / frameRatio
    )
    const nextWidth = Math.max(
      Math.min(rect.width + dWidth, upper),
      Math.min(pipMinWidth, upper)
    )
    setPipWidth(nextWidth)
    setPipOffset(
      clampToViewport(
        { x: rect.left, y: rect.top },
        {
          width: nextWidth,
          height: PIP_HANDLE_HEIGHT + nextWidth * frameRatio,
        }
      )
    )
  }

  const onGesturePointerDown = (
    event: PointerEvent<HTMLElement>,
    corner?: IframePipCorner
  ) => {
    const wrapper = wrapperRef.current
    if (!wrapper || event.button !== 0) return
    gestureRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      rect: wrapper.getBoundingClientRect(),
      corner,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveGesture(corner ?? 'move')
  }

  const onGesturePointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const pointer = { x: event.clientX, y: event.clientY }

    if (gesture.corner) {
      const next = resizeFromCorner(
        { ...gesture, corner: gesture.corner },
        pointer,
        pipMinWidth,
        pipMaxWidth
      )
      setPipWidth(next.width)
      setPipOffset(next.offset)
      return
    }

    setPipOffset(
      clampToViewport(
        {
          x: gesture.rect.left + pointer.x - gesture.start.x,
          y: gesture.rect.top + pointer.y - gesture.start.y,
        },
        gesture.rect
      )
    )
  }

  const onGesturePointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setActiveGesture(null)
  }

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? PIP_KEYBOARD_STEP * 5 : PIP_KEYBOARD_STEP
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const resizes: Record<string, number> = {
      '+': step * 2,
      '=': step * 2,
      '-': -step * 2,
    }

    if (moves[event.key]) {
      event.preventDefault()
      moveBy(...moves[event.key])
    } else if (pipResizable && resizes[event.key]) {
      event.preventDefault()
      resizeBy(resizes[event.key])
    }
  }

  const iframe = (
    <iframe
      {...props}
      ref={iframeRef}
      src={assignSource ? src : undefined}
      srcDoc={assignSource ? srcDoc : undefined}
      height={height}
      loading={loading}
      onLoad={handleLoad}
      tabIndex={disableEvents ? -1 : tabIndex}
      title={title}
      width={width}
      style={{
        border: 0,
        ...(fill || isPip
          ? {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
            }
          : {
              width: '100%',
              height: '100%',
            }),
        ...(disableEvents || activeGesture ? { pointerEvents: 'none' } : {}),
        ...style,
      }}
    />
  )

  const placeholderOverlay = showPlaceholder ? (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'Canvas',
      }}
    >
      {renderPlaceholder(placeholder, title)}
    </div>
  ) : null

  const facade = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'Canvas',
        color: 'CanvasText',
      }}
    >
      {hasPlaceholder ? (
        renderPlaceholder(placeholder, title)
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 16,
            textAlign: 'center',
          }}
        >
          {title}
        </div>
      )}
      <button
        type="button"
        aria-label={`Load ${title}`}
        onClick={activate}
        onPointerEnter={warmConnection}
        onFocus={warmConnection}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: '50%',
            fontSize: 22,
            color: '#fff',
            background: 'rgba(0, 0, 0, 0.65)',
          }}
        >
          ▶
        </span>
      </button>
    </div>
  )

  const frameContent = isFrameActive ? (
    <>
      {iframe}
      {placeholderOverlay}
    </>
  ) : (
    facade
  )

  if (isPip) {
    const corner = pipOptions.initialPosition ?? 'bottom-right'
    const [vertical, horizontal] = corner.split('-') as [
      'top' | 'bottom',
      'left' | 'right',
    ]
    const position: CSSProperties = pipOffset
      ? { left: pipOffset.x, top: pipOffset.y }
      : { [vertical]: PIP_MARGIN, [horizontal]: PIP_MARGIN }
    const gestureHandlers = {
      onPointerMove: onGesturePointerMove,
      onPointerUp: onGesturePointerEnd,
      onPointerCancel: onGesturePointerEnd,
    }

    return (
      <div
        ref={wrapperRef}
        aria-busy={showPlaceholder || undefined}
        style={{
          position: 'fixed',
          zIndex: 1000,
          ...position,
          width:
            pipWidth === null
              ? `min(${pipOptions.width ?? PIP_DEFAULT_WIDTH}px, calc(100vw - ${PIP_MARGIN * 2}px))`
              : pipWidth,
          maxWidth: '100vw',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'Canvas',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            height: PIP_HANDLE_HEIGHT,
            background: 'ButtonFace',
          }}
        >
          <button
            type="button"
            aria-label={
              pipResizable
                ? `Move or resize ${title}. Drag, use the arrow keys to move, or + and - to resize.`
                : `Move ${title}. Drag, or use the arrow keys.`
            }
            onPointerDown={(event) => onGesturePointerDown(event)}
            {...gestureHandlers}
            onKeyDown={onHandleKeyDown}
            style={{
              ...titleBarButtonStyle,
              flex: 1,
              minWidth: 0,
              gap: 6,
              padding: `0 ${PIP_GRIP_SIZE}px`,
              cursor: activeGesture === 'move' ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            <span aria-hidden="true">⠿</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
          </button>
          {pipPopOut && canPopOut && isFrameActive && !popOutWindow ? (
            <button
              type="button"
              aria-label={`Open ${title} in a picture-in-picture window`}
              title="Pop out"
              onClick={openPopOut}
              style={{
                ...titleBarButtonStyle,
                justifyContent: 'center',
                width: PIP_HANDLE_HEIGHT,
                marginRight: PIP_GRIP_SIZE,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <span aria-hidden="true">⧉</span>
            </button>
          ) : null}
        </div>
        {activeGesture ? (
          // Other iframes on the page would swallow pointer events mid-gesture,
          // so cover the viewport until it ends.
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1,
              cursor: gestureCursor,
            }}
          />
        ) : null}
        <div
          style={{
            position: 'relative',
            aspectRatio: resolvedAspectRatio ?? '16 / 9',
          }}
        >
          {popOutWindow ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 8,
                fontSize: 13,
                textAlign: 'center',
                color: 'CanvasText',
              }}
            >
              <span>Opened in a picture-in-picture window.</span>
              <button type="button" onClick={() => popOutWindow.close()}>
                Bring back
              </button>
            </div>
          ) : (
            frameContent
          )}
          {popOutWindow
            ? createPortal(
                <div style={{ position: 'fixed', inset: 0 }}>
                  {iframe}
                  {placeholderOverlay}
                </div>,
                popOutWindow.document.body
              )
            : null}
        </div>
        {pipResizable
          ? PIP_CORNERS.map((gripCorner) => {
              const [gripVertical, gripHorizontal] = gripCorner.split('-') as [
                'top' | 'bottom',
                'left' | 'right',
              ]
              return (
                <div
                  key={gripCorner}
                  aria-hidden="true"
                  onPointerDown={(event) =>
                    onGesturePointerDown(event, gripCorner)
                  }
                  {...gestureHandlers}
                  style={{
                    position: 'absolute',
                    [gripVertical]: 0,
                    [gripHorizontal]: 0,
                    zIndex: 2,
                    width: PIP_GRIP_SIZE,
                    height: PIP_GRIP_SIZE,
                    cursor: getResizeCursor(gripCorner),
                    touchAction: 'none',
                  }}
                />
              )
            })
          : null}
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      aria-busy={showPlaceholder || undefined}
      style={{
        position: 'relative',
        width: '100%',
        ...(fill
          ? { height: '100%' }
          : resolvedAspectRatio
            ? { aspectRatio: resolvedAspectRatio }
            : // The facade is absolutely positioned, so it can't size the box.
              isFrameActive
              ? {}
              : { height: getIntrinsicHeight(height) }),
      }}
    >
      {frameContent}
    </div>
  )
}
