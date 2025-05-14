import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Point {
  x: number
  y: number
}

type Corners = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface Corner {
  corner: Corners
  translation: Point
}

export function Draggable({
  children,
  padding,
  position: currentCorner,
  setPosition: setCurrentCorner,
  onDragStart,
  hideDevTools,
}: {
  children: React.ReactElement
  position: Corners
  padding: number
  setPosition: (position: Corners) => void
  onDragStart?: () => void
  hideDevTools: () => void
}) {
  const dismissRegionRef = useRef<HTMLDivElement>(null)

  const { ref, animate, ...drag } = useDrag({
    dismissRegionRef,
    threshold: 5,
    onDragStart,
    onDragEnd,
    onAnimationEnd,
  })

  function onDragEnd(translation: Point, velocity: Point) {
    const projectedPosition = {
      x: translation.x + project(velocity.x),
      y: translation.y + project(velocity.y),
    }
    const nearestCorner = getNearestCorner(projectedPosition)
    animate(nearestCorner)
  }

  function onAnimationEnd({ corner }: Corner) {
    // Unset drag translation
    setTimeout(() => {
      ref.current?.style.removeProperty('translate')
      setCurrentCorner(corner)
    })
  }

  function getNearestCorner({ x, y }: Point): Corner {
    const allCorners = getCorners()
    const distances = Object.entries(allCorners).map(([key, translation]) => {
      const distance = Math.sqrt(
        (x - translation.x) ** 2 + (y - translation.y) ** 2
      )
      return { key, distance }
    })
    const min = Math.min(...distances.map((d) => d.distance))
    const nearest = distances.find((d) => d.distance === min)
    if (!nearest) {
      // Safety fallback
      return { corner: currentCorner, translation: allCorners[currentCorner] }
    }
    return {
      translation: allCorners[nearest.key as Corners],
      corner: nearest.key as Corners,
    }
  }

  function getCorners(): Record<Corners, Point> {
    const offset = padding * 2
    const triggerWidth = ref.current?.offsetWidth || 0
    const triggerHeight = ref.current?.offsetHeight || 0
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth

    function getAbsolutePosition(corner: Corners) {
      const isRight = corner.includes('right')
      const isBottom = corner.includes('bottom')

      return {
        x: isRight
          ? window.innerWidth - scrollbarWidth - offset - triggerWidth
          : 0,
        y: isBottom ? window.innerHeight - offset - triggerHeight : 0,
      }
    }

    const basePosition = getAbsolutePosition(currentCorner)

    // Calculate all corner positions relative to the current corner
    return {
      'top-left': {
        x: 0 - basePosition.x,
        y: 0 - basePosition.y,
      },
      'top-right': {
        x:
          window.innerWidth -
          scrollbarWidth -
          offset -
          triggerWidth -
          basePosition.x,
        y: 0 - basePosition.y,
      },
      'bottom-left': {
        x: 0 - basePosition.x,
        y: window.innerHeight - offset - triggerHeight - basePosition.y,
      },
      'bottom-right': {
        x:
          window.innerWidth -
          scrollbarWidth -
          offset -
          triggerWidth -
          basePosition.x,
        y: window.innerHeight - offset - triggerHeight - basePosition.y,
      },
    }
  }

  const mounted = useState(false)

  useEffect(() => {
    mounted[1](true)
  }, [])

  const root = ref.current?.getRootNode()

  return (
    <>
      <div ref={ref} {...drag} style={{ touchAction: 'none' }}>
        {children}
      </div>
      {mounted &&
        root &&
        createPortal(
          <div
            ref={dismissRegionRef}
            style={{
              width: 37,
              height: 37,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              position: 'fixed',
              transform: 'translateX(-50%)',
              left: '50%',
              bottom: 32,
              borderRadius: 128,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 500,
              WebkitFontSmoothing: 'antialiased',
              pointerEvents: 'none',
              zIndex: 10000,
              transition: 'width 200ms var(--timing-swift)',
              boxShadow: `
                     0 0 0 1px #171717,
              inset 0 0 0 1px hsla(0, 0%, 100%, 0.14),
              0px 16px 32px -8px rgba(0, 0, 0, 0.24)
              `,
            }}
            onMouseEnter={() => {
              console.log('hi')
            }}
          >
            <svg
              data-testid="geist-icon"
              height="16"
              stroke-linejoin="round"
              viewBox="0 0 16 16"
              width="16"
            >
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M12.4697 13.5303L13 14.0607L14.0607 13L13.5303 12.4697L9.06065 7.99999L13.5303 3.53032L14.0607 2.99999L13 1.93933L12.4697 2.46966L7.99999 6.93933L3.53032 2.46966L2.99999 1.93933L1.93933 2.99999L2.46966 3.53032L6.93933 7.99999L2.46966 12.4697L1.93933 13L2.99999 14.0607L3.53032 13.5303L7.99999 9.06065L12.4697 13.5303Z"
                fill="currentColor"
              ></path>
            </svg>
          </div>,
          root
        )}
    </>
  )
}

interface UseDragOptions {
  onDragStart?: () => void
  onDrag?: (translation: Point) => void
  onDragEnd?: (translation: Point, velocity: Point) => void
  onAnimationEnd?: (corner: Corner) => void
  threshold: number // Minimum movement before drag starts
  dismissRegionRef: React.RefObject<HTMLDivElement | null>
}

interface Velocity {
  position: Point
  timestamp: number
}

export function useDrag({
  onDragStart,
  onDrag,
  onDragEnd,
  onAnimationEnd,
  threshold,
  dismissRegionRef,
}: UseDragOptions) {
  const ref = useRef<HTMLDivElement | null>(null)
  const state = useRef<'idle' | 'press' | 'drag' | 'drag-end'>('idle')
  const snapped = useRef(false)
  const animating = useRef(false)

  const origin = useRef<Point>({ x: 0, y: 0 })
  const translation = useRef<Point>({ x: 0, y: 0 })
  const lastTimestamp = useRef(0)
  const velocities = useRef<Velocity[]>([])

  function set(position: Point) {
    if (ref.current) {
      translation.current = position
      ref.current.style.translate = `${position.x}px ${position.y}px`
    }
  }

  function transition() {
    const el = ref.current
    if (el === null) return

    function listener(e: TransitionEvent) {
      if (e.propertyName === 'translate') {
        el!.style.transition = ''
        el!.removeEventListener('transitionend', listener)
        animating.current = false
      }
    }

    el.style.transition = 'translate 250ms var(--timing-bounce)'
    el.addEventListener('transitionend', listener)
  }

  function animate(corner: Corner) {
    const el = ref.current
    if (el === null) return

    function listener(e: TransitionEvent) {
      if (e.propertyName === 'translate') {
        onAnimationEnd?.(corner)
        translation.current = { x: 0, y: 0 }
        el!.style.transition = ''
        el!.removeEventListener('transitionend', listener)
      }
    }

    // Generated from https://www.easing.dev/spring
    el.style.transition = 'translate 491.22ms var(--timing-bounce)'
    el.addEventListener('transitionend', listener)
    set(corner.translation)
  }

  function onClick(e: MouseEvent) {
    if (state.current === 'drag-end') {
      e.preventDefault()
      e.stopPropagation()
      state.current = 'idle'
      ref.current?.removeEventListener('click', onClick)
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    origin.current = { x: e.clientX, y: e.clientY }
    state.current = 'press'
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    ref.current?.addEventListener('click', onClick)
  }

  function onPointerMove(e: PointerEvent) {
    if (state.current === 'press') {
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance >= threshold) {
        state.current = 'drag'
        ref.current?.setPointerCapture(e.pointerId)
        ref.current?.style.removeProperty('transition')
        ref.current?.classList.add('dev-tools-grabbing')
        document.body.style.setProperty('cursor', 'grabbing')
        onDragStart?.()
      }
    }

    if (state.current !== 'drag') return

    const dismissRegion = dismissRegionRef.current!
    const currentPosition = { x: e.clientX, y: e.clientY }

    const dx = currentPosition.x - origin.current.x
    const dy = currentPosition.y - origin.current.y
    origin.current = currentPosition

    const damping = snapped.current ? 0.1 : 1
    const newTranslation = {
      x: translation.current.x + dx * damping,
      y: translation.current.y + dy * damping,
    }

    const undampenedTranslation = {
      x: translation.current.x + dx,
      y: translation.current.y + dy,
    }

    const intersecting = areIntersecting(ref.current, dismissRegion, 10)

    if (intersecting && !snapped.current) {
      snapped.current = true
      animating.current = true
      dismissRegion.style.setProperty('width', `${ref.current?.offsetWidth}px`)

      const dismissRect = dismissRegion.getBoundingClientRect()
      const triggerRect = ref.current?.getBoundingClientRect()

      if (triggerRect) {
        // Center the trigger over the dismiss region
        newTranslation.x +=
          dismissRect.left +
          dismissRect.width / 2 -
          (triggerRect.left + triggerRect.width / 2)
        newTranslation.y +=
          dismissRect.top +
          dismissRect.height / 2 -
          (triggerRect.top + triggerRect.height / 2)

        set(newTranslation)
        transition()
      }
    }

    if (!intersecting && snapped.current) {
      transition()
      animating.current = true
      snapped.current = false
      set(undampenedTranslation)
      dismissRegion?.style.setProperty('width', '37px')
    }

    if (!animating.current) {
      set(newTranslation)
    }

    // Keep a history of recent positions for velocity calculation
    // Only store points that are at least 10ms apart to avoid too many samples
    const now = Date.now()
    const shouldAddToHistory = now - lastTimestamp.current >= 10
    if (shouldAddToHistory) {
      velocities.current = [
        ...velocities.current.slice(-5),
        { position: currentPosition, timestamp: now },
      ]
    }

    lastTimestamp.current = now
    onDrag?.(translation.current)
  }

  function onPointerUp(e: PointerEvent) {
    state.current = state.current === 'drag' ? 'drag-end' : 'idle'
    dismissRegionRef.current?.style.setProperty('width', '37px')

    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)

    const velocity = calculateVelocity(velocities.current)
    velocities.current = []

    document.body.style.removeProperty('cursor')
    ref.current?.classList.remove('dev-tools-grabbing')
    ref.current?.releasePointerCapture(e.pointerId)
    onDragEnd?.(translation.current, velocity)
  }

  return {
    ref,
    onPointerDown,
    animate,
  }
}

function calculateVelocity(
  history: Array<{ position: Point; timestamp: number }>
): Point {
  if (history.length < 2) {
    return { x: 0, y: 0 }
  }

  const oldestPoint = history[0]
  const latestPoint = history[history.length - 1]

  const timeDelta = latestPoint.timestamp - oldestPoint.timestamp

  if (timeDelta === 0) {
    return { x: 0, y: 0 }
  }

  // Calculate pixels per millisecond
  const velocityX =
    (latestPoint.position.x - oldestPoint.position.x) / timeDelta
  const velocityY =
    (latestPoint.position.y - oldestPoint.position.y) / timeDelta

  // Convert to pixels per second for more intuitive values
  return {
    x: velocityX * 1000,
    y: velocityY * 1000,
  }
}

function project(initialVelocity: number, decelerationRate = 0.999) {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

function areIntersecting(
  el1: HTMLElement | null,
  el2: HTMLElement | null,
  padding = 0
) {
  if (!el1 || !el2) return false
  const rect1 = el1.getBoundingClientRect()
  const rect2 = el2.getBoundingClientRect()
  return !(
    rect1.right + padding < rect2.left ||
    rect1.left - padding > rect2.right ||
    rect1.bottom + padding < rect2.top ||
    rect1.top - padding > rect2.bottom
  )
}
