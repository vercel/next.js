import { useRef } from 'react'
import { IconCross } from '../../../icons/icon-cross'

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
  size,
  position: currentCorner,
  setPosition: setCurrentCorner,
  onDragStart,
  hideDevTools,
}: {
  children: React.ReactElement
  position: Corners
  padding: number
  size?: number
  setPosition: (position: Corners) => void
  onDragStart?: () => void
  hideDevTools: () => void
}) {
  const hideRegionRef = useRef<HTMLDivElement>(null)
  const { ref, animate, ...drag } = useDrag({
    hideRegionRef,
    threshold: 5,
    onDragStart,
    onDragEnd,
  })

  function onDragEnd(hide: Boolean, translation: Point, velocity: Point) {
    if (hide) {
      const animation = ref.current?.animate(
        [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: 'blur(2px)' },
        ],
        {
          duration: 150,
          easing: 'ease-out',
          fill: 'forwards',
        }
      )
      animation?.finished.then(hideDevTools)
      return
    }

    const projectedPosition = {
      x: translation.x + project(velocity.x),
      y: translation.y + project(velocity.y),
    }

    const nearestCorner = getNearestCorner(projectedPosition)
    animate(nearestCorner, () => {
      setTimeout(() => {
        ref.current?.style.removeProperty('translate')
        setCurrentCorner(nearestCorner.corner)
      })
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

  return (
    <>
      <div aria-hidden className="dev-tools-indicator-hide-region">
        <div className="dev-tools-indicator-hide-region-backdrop" />
        <div
          ref={hideRegionRef}
          className="dev-tools-indicator-hide-region-icon"
          style={{ width: size, height: size }}
        >
          <IconCross />
        </div>
      </div>
      <div ref={ref} {...drag} style={{ touchAction: 'none' }}>
        {children}
      </div>
    </>
  )
}

interface UseDragOptions {
  onDragStart?: () => void
  onDrag?: (translation: Point) => void
  onDragEnd?: (hide: Boolean, translation: Point, velocity: Point) => void
  threshold: number // Minimum movement before drag starts
  hideRegionRef: React.RefObject<HTMLDivElement | null>
}

interface Velocity {
  position: Point
  timestamp: number
}

export function useDrag({
  onDragStart,
  onDrag,
  onDragEnd,
  threshold,
  hideRegionRef,
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

  function transition(config: string, onTransitionEnd?: () => void) {
    const el = ref.current
    if (el === null) return

    function listener(e: TransitionEvent) {
      if (e.propertyName === 'translate') {
        onTransitionEnd?.()
        el?.style.removeProperty('transition')
        el?.removeEventListener('transitionend', listener)
        animating.current = false
      }
    }

    el.style.setProperty('transition', config)
    el.addEventListener('transitionend', listener)
  }

  function animate(corner: Corner, onTransitionEnd?: () => void) {
    // Generated from https://www.easing.dev/spring
    transition('translate 491.22ms var(--timing-bounce)', () => {
      onTransitionEnd?.()
      translation.current = { x: 0, y: 0 }
    })
    set(corner.translation)
  }

  function onClick(e: MouseEvent) {
    if (state.current === 'drag-end') {
      e.preventDefault()
      e.stopPropagation()
      state.current = 'idle'
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    origin.current = { x: e.clientX, y: e.clientY }
    state.current = 'press'
  }

  function onPointerMove(e: React.PointerEvent) {
    if (state.current === 'press') {
      ref.current?.setPointerCapture(e.pointerId)
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance >= threshold) {
        state.current = 'drag'
        ref.current?.style.removeProperty('transition')
        ref.current?.classList.add('dev-tools-grabbing')
        document.body.style.setProperty('cursor', 'grabbing')
        hideRegionRef.current?.setAttribute('data-show', 'true')
        onDragStart?.()
      }
    }

    if (state.current !== 'drag') return

    const hideRegion = hideRegionRef.current!
    const currentPosition = { x: e.clientX, y: e.clientY }

    const dx = currentPosition.x - origin.current.x
    const dy = currentPosition.y - origin.current.y
    origin.current = currentPosition

    const intersecting = areIntersecting(ref.current, hideRegion, 20)
    const damping = intersecting ? 0.1 : 1

    const newTranslation = {
      x: translation.current.x + dx * damping,
      y: translation.current.y + dy * damping,
    }

    if (intersecting && !snapped.current) {
      snapped.current = true
      animating.current = true
      hideRegion.style.setProperty('width', `${ref.current?.offsetWidth}px`)

      const hideRegionTranslation = getHideRegionTranslation()
      // Center the trigger over the hide region
      newTranslation.x += hideRegionTranslation.x
      newTranslation.y += hideRegionTranslation.y

      set(newTranslation)
      transition('translate 250ms var(--timing-bounce)')
    }

    if (!intersecting && snapped.current) {
      // transition()
      // animating.current = true
      snapped.current = false
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

  function onPointerUp(e: React.PointerEvent) {
    state.current = state.current === 'drag' ? 'drag-end' : 'idle'
    const velocity = calculateVelocity(velocities.current)
    velocities.current = []

    if (snapped.current) {
      const hideRegionTranslation = getHideRegionTranslation()
      // Center the trigger over the hide region on pointer up when snapped
      const finalTranslation = {
        x: translation.current.x + hideRegionTranslation.x,
        y: translation.current.y + hideRegionTranslation.y,
      }
      set(finalTranslation)
      transition('translate 250ms var(--timing-bounce)', () => {
        onDragEnd?.(true, translation.current, velocity)
        hideRegionRef.current?.removeAttribute('data-show')
      })
    }

    document.body.style.removeProperty('cursor')
    ref.current?.classList.remove('dev-tools-grabbing')
    if (!snapped.current) {
      onDragEnd?.(false, translation.current, velocity)
      hideRegionRef.current?.removeAttribute('data-show')
    }
    ref.current?.releasePointerCapture(e.pointerId)
    snapped.current = false
  }

  function getHideRegionTranslation() {
    const hideRegion = hideRegionRef.current!
    const hideRect = hideRegion.getBoundingClientRect()
    const triggerRect = ref.current?.getBoundingClientRect()

    if (!triggerRect) return { x: 0, y: 0 }

    return {
      x:
        hideRect.left +
        hideRect.width / 2 -
        (triggerRect.left + triggerRect.width / 2),
      y:
        hideRect.top +
        hideRect.height / 2 -
        (triggerRect.top + triggerRect.height / 2),
    }
  }

  return {
    ref,
    onClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
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
