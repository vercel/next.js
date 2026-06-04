import { startTransition, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  lock,
  unlock,
  useInstantNavCookieState,
  formatRoutePattern,
} from '../next-devtools/shared/instant-navs-cookie'

const CORNER_STORAGE_KEY = '__next_instant_devtools_corner'
const DRAG_THRESHOLD = 5
const PADDING = 16

// The dev overlay's spring easing (`--timing-bounce`), inlined so the widget's
// snap matches the indicator without pulling in the theme CSS.
const SPRING_EASING =
  'linear(0 0%, 0.005871 1%, 0.022058 2%, 0.046612 3%, 0.077823 4%, 0.114199 5%, 0.154441 6%, 0.197431 7.000000000000001%, 0.242208 8%, 0.287959 9%, 0.333995 10%, 0.379743 11%, 0.424732 12%, 0.46858 13%, 0.510982 14.000000000000002%, 0.551702 15%, 0.590564 16%, 0.627445 17%, 0.662261 18%, 0.694971 19%, 0.725561 20%, 0.754047 21%, 0.780462 22%, 0.804861 23%, 0.82731 24%, 0.847888 25%, 0.866679 26%, 0.883775 27%, 0.899272 28.000000000000004%, 0.913267 28.999999999999996%, 0.925856 30%, 0.937137 31%, 0.947205 32%, 0.956153 33%, 0.96407 34%, 0.971043 35%, 0.977153 36%, 0.982479 37%, 0.987094 38%, 0.991066 39%, 0.994462 40%, 0.997339 41%, 0.999755 42%, 1.001761 43%, 1.003404 44%, 1.004727 45%, 1.00577 46%, 1.006569 47%, 1.007157 48%, 1.007563 49%, 1.007813 50%, 1.007931 51%, 1.007939 52%, 1.007855 53%, 1.007697 54%, 1.007477 55.00000000000001%, 1.00721 56.00000000000001%, 1.006907 56.99999999999999%, 1.006576 57.99999999999999%, 1.006228 59%, 1.005868 60%, 1.005503 61%, 1.005137 62%, 1.004776 63%, 1.004422 64%, 1.004078 65%, 1.003746 66%, 1.003429 67%, 1.003127 68%, 1.00284 69%, 1.002571 70%, 1.002318 71%, 1.002082 72%, 1.001863 73%, 1.00166 74%, 1.001473 75%, 1.001301 76%, 1.001143 77%, 1.001 78%, 1.000869 79%, 1.000752 80%, 1.000645 81%, 1.00055 82%, 1.000464 83%, 1.000388 84%, 1.000321 85%, 1.000261 86%, 1.000209 87%, 1.000163 88%, 1.000123 89%, 1.000088 90%)'
const SPRING_TRANSITION = `translate 491.22ms ${SPRING_EASING}`

type Point = { x: number; y: number }
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const CORNERS: Corner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

function readStoredCorner(): Corner {
  try {
    const raw = localStorage.getItem(CORNER_STORAGE_KEY)
    if (
      raw === 'top-left' ||
      raw === 'top-right' ||
      raw === 'bottom-left' ||
      raw === 'bottom-right'
    ) {
      return raw
    }
  } catch {}
  return 'bottom-right'
}

// iOS-style deceleration projection (decelerationRate 0.999), matching
// next-devtools' Draggable so a flick throws the widget to a far corner.
function project(velocity: number): number {
  return ((velocity / 1000) * 0.999) / (1 - 0.999)
}

function calcVelocity(history: Array<{ p: Point; t: number }>): Point {
  if (history.length < 2) return { x: 0, y: 0 }
  const first = history[0]
  const last = history[history.length - 1]
  const dt = last.t - first.t
  if (dt === 0) return { x: 0, y: 0 }
  return {
    x: ((last.p.x - first.p.x) / dt) * 1000,
    y: ((last.p.y - first.p.y) / dt) * 1000,
  }
}

// A small self-contained "stick to the nearest corner" drag hook, mirroring
// next-devtools' Draggable: drag via a `translate` transform, then on release
// project by velocity and spring to the nearest corner. No dev-overlay deps.
function useDraggable() {
  const ref = useRef<HTMLDivElement>(null)
  const [corner, setCorner] = useState<Corner>(readStoredCorner)
  const drag = useRef<{ originX: number; originY: number } | null>(null)
  const translation = useRef<Point>({ x: 0, y: 0 })
  const velocities = useRef<Array<{ p: Point; t: number }>>([])
  const lastSample = useRef(0)
  const movedRef = useRef(false)
  const animationCleanup = useRef<(() => void) | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CORNER_STORAGE_KEY, corner)
    } catch {}
  }, [corner])

  function setTranslate(p: Point): void {
    translation.current = p
    if (ref.current) {
      ref.current.style.translate = `${p.x}px ${p.y}px`
    }
  }

  // Each corner's translation relative to the current resting corner (so the
  // current corner is {0,0}). Mirrors Draggable.getCorners().
  function cornerOffsets(): Record<Corner, Point> {
    const el = ref.current
    const offset = PADDING * 2
    const width = el?.offsetWidth ?? 0
    const height = el?.offsetHeight ?? 0
    const scrollbar = window.innerWidth - document.documentElement.clientWidth

    function absolute(c: Corner): Point {
      return {
        x: c.includes('right')
          ? window.innerWidth - scrollbar - offset - width
          : 0,
        y: c.includes('bottom') ? window.innerHeight - offset - height : 0,
      }
    }

    const base = absolute(corner)
    const result = {} as Record<Corner, Point>
    for (const c of CORNERS) {
      const pos = absolute(c)
      result[c] = { x: pos.x - base.x, y: pos.y - base.y }
    }
    return result
  }

  function snapToNearest(): void {
    const el = ref.current
    if (!el) return
    const offsets = cornerOffsets()
    const velocity = calcVelocity(velocities.current)
    const projected = {
      x: translation.current.x + project(velocity.x),
      y: translation.current.y + project(velocity.y),
    }
    let nearest: Corner = corner
    let min = Infinity
    for (const c of CORNERS) {
      const o = offsets[c]
      const distance = Math.hypot(projected.x - o.x, projected.y - o.y)
      if (distance < min) {
        min = distance
        nearest = c
      }
    }

    function onEnd(ev: TransitionEvent): void {
      if (ev.propertyName !== 'translate') return
      el!.removeEventListener('transitionend', onEnd)
      animationCleanup.current = null
      el!.style.transition = ''
      // Commit the corner and drop the transform in the same frame so the
      // element stays put when its anchor switches to the new corner.
      setTimeout(() => {
        el!.style.removeProperty('translate')
        translation.current = { x: 0, y: 0 }
        setCorner(nearest)
      })
    }
    animationCleanup.current = () => {
      el.removeEventListener('transitionend', onEnd)
      animationCleanup.current = null
    }
    el.addEventListener('transitionend', onEnd)
    el.style.transition = SPRING_TRANSITION
    setTranslate(offsets[nearest])
  }

  function onPointerDown(e: PointerEvent<HTMLElement>): void {
    if (e.button !== 0) return
    const el = ref.current
    if (!el) return
    // Interrupt any in-flight snap so a new grab starts cleanly.
    if (animationCleanup.current) {
      animationCleanup.current()
    }
    el.style.transition = ''
    drag.current = { originX: e.clientX, originY: e.clientY }
    movedRef.current = false
    velocities.current = []
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLElement>): void {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.originX
    const dy = e.clientY - d.originY
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return
    }
    movedRef.current = true
    d.originX = e.clientX
    d.originY = e.clientY
    setTranslate({
      x: translation.current.x + dx,
      y: translation.current.y + dy,
    })
    const now = Date.now()
    if (now - lastSample.current >= 10) {
      velocities.current = [
        ...velocities.current.slice(-5),
        { p: { x: e.clientX, y: e.clientY }, t: now },
      ]
      lastSample.current = now
    }
  }

  function onPointerUp(e: PointerEvent<HTMLElement>): void {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (movedRef.current) {
      snapToNearest()
    }
  }

  return {
    ref,
    corner,
    didDrag: () => movedRef.current,
    dragHandleProps: { onPointerDown, onPointerMove, onPointerUp },
  }
}

const OPEN_STORAGE_KEY = '__next_instant_devtools_open'

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {}
  return false
}

function InstantNavigationToggle() {
  const [minimized, setMinimized] = useState(() => !readStoredOpen())
  const cookieData = useInstantNavCookieState()
  const { ref, corner, didDrag, dragHandleProps } = useDraggable()
  const styles = getStyles(corner)

  // Persist open/closed across reloads (capturing a "Page load" needs a reload).
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, minimized ? '0' : '1')
    } catch {}
  }, [minimized])

  if (minimized) {
    return (
      <div ref={ref} style={styles.root}>
        <button
          style={styles.indicator}
          type="button"
          aria-label="Open Navigation Inspector"
          onPointerDown={dragHandleProps.onPointerDown}
          onPointerMove={dragHandleProps.onPointerMove}
          onPointerUp={(e) => {
            dragHandleProps.onPointerUp(e)
            if (!didDrag()) setMinimized(false)
          }}
        >
          <NextMark />
        </button>
      </div>
    )
  }

  const state = cookieData?.state ?? null
  const isLocked = state !== null
  const isPending = state === 'pending'
  const spaSourceUrl =
    cookieData?.state === 'spa' ? formatRoutePattern(cookieData.fromTree) : null

  return (
    <div ref={ref} style={styles.root}>
      <div style={styles.card}>
        <div
          style={styles.header}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            dragHandleProps.onPointerDown(e)
          }}
          onPointerMove={dragHandleProps.onPointerMove}
          onPointerUp={dragHandleProps.onPointerUp}
        >
          <span>Navigation Inspector</span>
          <button
            style={styles.closeButton}
            onClick={() => {
              // Closing the inspector stops capturing, like the dev overlay.
              unlock()
              setMinimized(true)
            }}
            type="button"
            aria-label="Minimize Navigation Inspector"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div style={styles.body}>
          {state === null && (
            <p style={styles.intro}>
              Inspect the UI that will show instantly to users as they navigate
              around your app. Start capturing, then click any link or refresh
              the current page.
            </p>
          )}
          {state === 'pending' && (
            <div style={styles.stateCard}>
              <div style={styles.stateTitle}>Awaiting navigation...</div>
              <p style={styles.stateDesc}>
                Click any link or refresh the page.
              </p>
            </div>
          )}
          {state === 'mpa' && (
            <div style={styles.stateCard}>
              <div style={styles.stateTitle}>Page load</div>
              <p style={styles.stateDesc}>
                You're viewing the prerendered UI for the current page.
              </p>
            </div>
          )}
          {state === 'spa' && (
            <div style={styles.stateCard}>
              <div style={styles.stateTitle}>Navigation</div>
              <p style={styles.stateDesc}>
                You're viewing the prefetched UI for the last navigation.
              </p>
              {spaSourceUrl !== null && (
                <p style={styles.sourceUrl} title={spaSourceUrl}>
                  Source URL: {spaSourceUrl}
                </p>
              )}
            </div>
          )}
        </div>

        <div style={styles.controls}>
          {isLocked ? (
            <button
              type="button"
              style={{ ...styles.captureButton, ...styles.captureButtonActive }}
              onClick={unlock}
            >
              <span style={styles.captureIconInline}>
                <StopIcon />
              </span>
              Stop Capturing
            </button>
          ) : (
            <button type="button" style={styles.captureButton} onClick={lock}>
              <span style={styles.captureIconInline}>
                <RecordIcon />
              </span>
              Start Capturing
            </button>
          )}
          <button
            type="button"
            style={{
              ...styles.captureButton,
              ...(!isLocked || isPending ? styles.captureButtonDisabled : null),
            }}
            onClick={() => {
              // Release the lock, which triggers the soft refresh that streams
              // the real dynamic UI. We intentionally do not re-arm capture
              // here: re-locking races the refresh and can re-freeze the page
              // before it finishes rendering. Use Start Capturing again for the
              // next navigation.
              unlock()
            }}
            disabled={!isLocked || isPending}
          >
            <span style={styles.captureIconInline}>
              <PlayIcon />
            </span>
            Continue Rendering
          </button>
        </div>
      </div>
    </div>
  )
}

let isMounted = false

export function renderInstantDevTools(): void {
  if (!isMounted) {
    const script = document.createElement('script')
    script.style.display = 'block'
    script.style.position = 'absolute'
    script.setAttribute('data-next-instant-devtools', 'true')

    const container = document.createElement('next-instant-devtools')

    script.appendChild(container)
    document.body.appendChild(script)

    const root = createRoot(container, {
      identifierPrefix: 'nidt-',
      onDefaultTransitionIndicator: () => () => {},
    })

    const shadowRoot = container.attachShadow({ mode: 'open' })

    startTransition(() => {
      root.render(createPortal(<InstantNavigationToggle />, shadowRoot))
    })

    isMounted = true
  }
}

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

function getStyles(corner: Corner) {
  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
  const bg = isDarkMode ? '#1a1a1a' : '#fff'
  const bg2 = isDarkMode ? '#1f1f1f' : '#fafafa'
  const text = isDarkMode ? '#ededed' : '#171717'
  const textMuted = isDarkMode ? '#a0a0a0' : '#666'
  const textFaint = isDarkMode ? '#7a7a7a' : '#8f8f8f'
  const border = isDarkMode ? '#2e2e2e' : '#e5e5e5'
  const borderStrong = isDarkMode ? '#454545' : '#cfcfcf'
  const redBg = isDarkMode ? '#341619' : '#fff0f1'
  const redBorder = isDarkMode ? '#b54548' : '#e5484d'
  const redText = isDarkMode ? '#ff9592' : '#cd2b31'
  const shadow = isDarkMode
    ? '0 2px 8px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.08)'
    : '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)'

  return {
    root: {
      position: 'fixed',
      zIndex: 9999,
      top: corner.includes('top') ? PADDING : undefined,
      bottom: corner.includes('top') ? undefined : PADDING,
      left: corner.includes('right') ? undefined : PADDING,
      right: corner.includes('right') ? PADDING : undefined,
    } as const,
    card: {
      borderRadius: 12,
      fontFamily: FONT,
      fontSize: 14,
      overflow: 'hidden',
      background: bg,
      color: text,
      boxShadow: shadow,
      width: 400,
    },
    indicator: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.8)',
      border: 'none',
      cursor: 'grab',
      touchAction: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow:
        '0 0 0 1px #171717, inset 0 0 0 1px hsla(0,0%,100%,0.14), 0 16px 32px -8px rgba(0,0,0,0.24)',
      padding: 0,
      overflow: 'hidden',
    },
    header: {
      padding: '10px 16px',
      fontWeight: 600,
      fontSize: 13,
      borderBottom: `1px solid ${border}`,
      letterSpacing: '0.02em',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: textMuted,
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
    },
    closeButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      color: textMuted,
      flexShrink: 0,
    },
    body: {
      padding: '14px 16px',
    },
    intro: {
      margin: 0,
      color: text,
      fontSize: 13,
      lineHeight: 1.5,
    },
    stateCard: {
      padding: 14,
      borderRadius: 8,
      background: bg2,
      border: `1px solid ${borderStrong}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    stateTitle: {
      margin: 0,
      fontSize: 16,
      fontWeight: 600,
      color: text,
    },
    stateDesc: {
      margin: 0,
      fontSize: 13,
      color: text,
    },
    sourceUrl: {
      margin: '8px 0 0',
      fontSize: 12,
      color: textMuted,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    controls: {
      display: 'flex',
      gap: 10,
      padding: '0 16px 16px',
    },
    captureButton: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      gap: 6,
      padding: '8px 12px',
      borderRadius: 9999,
      border: `1px solid ${borderStrong}`,
      background: bg,
      color: text,
      fontSize: 13,
      fontWeight: 400,
      fontFamily: FONT,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    captureButtonActive: {
      background: redBg,
      borderColor: redBorder,
      color: redText,
    },
    captureButtonDisabled: {
      borderColor: border,
      color: textFaint,
      cursor: 'not-allowed',
    },
    captureIconInline: {
      display: 'flex',
      alignItems: 'center',
    },
  } as const
}

function RecordIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <circle cx="8" cy="8" r="3.25" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  )
}

function NextMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <g transform="translate(13, 13)">
        <path
          d="M13.3 15.2 L2.34 1 V12.6"
          fill="none"
          stroke="url(#next_logo_paint0_linear_1357_10853)"
          strokeWidth="1.86"
          mask="url(#next_logo_mask0)"
          strokeDasharray="29.6"
          strokeDashoffset={0}
        />
        <path
          d="M11.825 1.5 V13.1"
          strokeWidth="1.86"
          stroke="url(#next_logo_paint1_linear_1357_10853)"
          strokeDasharray="11.6"
          strokeDashoffset={0}
        />
      </g>
      <defs>
        <linearGradient
          id="next_logo_paint0_linear_1357_10853"
          x1="9.95555"
          y1="11.1226"
          x2="15.4778"
          y2="17.9671"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.604072" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="next_logo_paint1_linear_1357_10853"
          x1="11.8222"
          y1="1.40039"
          x2="11.791"
          y2="9.62542"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="next_logo_mask0">
          <rect width="100%" height="100%" fill="white" />
          <rect width="5" height="1.5" fill="black" />
        </mask>
      </defs>
    </svg>
  )
}
