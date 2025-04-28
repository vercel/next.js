// @ts-nocheck
import { cloneElement, useEffect, useRef, useState } from 'react'

interface Point {
  x: number
  y: number
}

type Corners = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface Corner {
  corner: Corner
  translation: Point
}

export function Draggable({
  children,
  padding: PADDING,
  position: currentCorner,
  setPosition: setCurrentCorner,
}: {
  children: React.ReactElement
  position: Corners
  padding: number
  setPosition: (position: Corners) => void
}) {
  const { ref, animate, animating, ...drag } = useDrag({
    onDragEnd: (translation, velocity) => {
      const decelerationRate = 0.999

      const projectedPosition = {
        x: translation.x + project(velocity.x, decelerationRate),
        y: translation.y + project(velocity.y, decelerationRate),
      }

      const nearestCorner = getNearestCorner(projectedPosition)
      animate(nearestCorner)
    },
    onAnimationEnd: ({ corner }: Corner) => {
      // Unset drag translation
      // ref.current.style.transition = 'none'
      console.log('animating', animating)
      ref.current.style.translate = 'none'
      setCurrentCorner(corner)
    },
  })

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
      return allCorners['bottom-left']
    }
    return {
      translation: allCorners[nearest.key as Corners],
      corner: nearest.key as Corners,
    }
  }

  function getCorners(): Record<Corners, Point> {
    const offset = PADDING * 2
    const triggerWidth = ref.current?.offsetWidth || 0
    const triggerHeight = ref.current?.offsetHeight || 0

    function getAbsolutePosition(corner) {
      const isRight = corner.includes('right')
      const isBottom = corner.includes('bottom')

      return {
        x: isRight ? window.innerWidth - offset - triggerWidth : 0,
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
        x: window.innerWidth - offset - triggerWidth - basePosition.x,
        y: 0 - basePosition.y,
      },
      'bottom-left': {
        x: 0 - basePosition.x,
        y: window.innerHeight - offset - triggerHeight - basePosition.y,
      },
      'bottom-right': {
        x: window.innerWidth - offset - triggerWidth - basePosition.x,
        y: window.innerHeight - offset - triggerHeight - basePosition.y,
      },
    }
  }

  return cloneElement(children, {
    ref,
    ...drag,
    style: {
      ...children.props.style,
      transition: animating
        ? 'translate 491.22ms var(--timing-bounce)'
        : undefined,
    },
  })
}

interface UseDragOptions {
  onDrag?: (translation: Point) => void
  onDragEnd?: (translation: Point, velocity: Point) => void
  onAnimationEnd?: (corner: Corner) => void
  threshold?: number // Minimum movement before drag starts
}

interface Velocity {
  position: Point
  timestamp: number
}

export function useDrag(options: UseDragOptions = {}) {
  const { threshold = 10 } = options

  const ref = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const translation = useRef<Point>({ x: 0, y: 0 })
  const lastTimestamp = useRef(0)
  const velocities = useRef<Velocity[]>([])
  const [animating, setAnimating] = useState(false)

  // Refs to track previous pointer position for delta calculations
  const prevClientXRef = useRef(0)
  const prevClientYRef = useRef(0)

  useEffect(() => {
    function onGlobalPointerMove(e: PointerEvent) {
      if (!dragging.current) return
      console.log('move')
      const currentPosition = { x: e.clientX, y: e.clientY }
      const now = Date.now()

      const dx = e.clientX - prevClientXRef.current
      const dy = e.clientY - prevClientYRef.current
      // Update previous position refs
      prevClientXRef.current = e.clientX
      prevClientYRef.current = e.clientY

      // Calculate new translation based on dx and dy
      const newTranslation = {
        x: translation.current.x + dx,
        y: translation.current.y + dy,
      }

      set(newTranslation)

      // Keep a history of recent positions for velocity calculation
      // Only store points that are at least 10ms apart to avoid too many samples
      const shouldAddToHistory = now - lastTimestamp.current >= 10
      if (shouldAddToHistory) {
        velocities.current = [
          ...velocities.current.slice(-5),
          { position: currentPosition, timestamp: now },
        ]
      }

      lastTimestamp.current = now
      options.onDrag?.(translation.current)
    }

    window.addEventListener('pointermove', onGlobalPointerMove)

    return () => {
      window.removeEventListener('pointermove', onGlobalPointerMove)
    }
  }, [])

  function set(position: Point) {
    if (ref.current) {
      translation.current = position
      ref.current.style.translate = `${position.x}px ${position.y}px`
    }
  }

  function animate(corner: Corner) {
    function listener(e: TransitionEvent) {
      if (e.propertyName === 'translate') {
        setAnimating(false)
        options.onAnimationEnd?.(corner)
        translation.current = { x: 0, y: 0 }
        ref.current?.removeEventListener('transitionend', listener)
      }
    }
    if (ref.current) {
      ref.current.addEventListener('transitionend', listener)
    }
    setAnimating(true)
    set(corner.translation)
  }

  function onPointerDown(e: React.PointerEvent) {
    prevClientXRef.current = e.clientX
    prevClientYRef.current = e.clientY
    dragging.current = true
    setAnimating(false)
    e.preventDefault()
  }

  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false
    console.log(velocities.current)
    const velocity = calculateVelocity(velocities.current)
    options.onDragEnd?.(translation.current, velocity)
    velocities.current = []
    if (ref.current) {
      ref.current.releasePointerCapture(e.pointerId)
    }
  }

  function onPointerCancel() {
    dragging.current = false
    velocities.current = []
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging.current && ref.current) {
      ref.current.setPointerCapture(e.pointerId)
    }
  }

  return {
    ref,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    animate,
    animating,
  }
}

// Helper function to calculate velocity from position history
function calculateVelocity(
  history: Array<{ position: Position; timestamp: number }>
): Position {
  if (history.length < 2) {
    return { x: 0, y: 0 }
  }

  // Use the last few points to get a more stable velocity
  const numPoints = Math.min(history.length, 5)
  const recentHistory = history.slice(-numPoints)

  const oldestPoint = recentHistory[0]
  const latestPoint = recentHistory[recentHistory.length - 1]

  const timeDelta = latestPoint.timestamp - oldestPoint.timestamp

  // Avoid division by zero
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

function getRelativeCoordinates(target, reference) {
  const targetRect = target.getBoundingClientRect()
  const referenceRect = reference.getBoundingClientRect()

  const x = targetRect.left - referenceRect.left
  const y = targetRect.top - referenceRect.top

  return { x, y }
}

function relativeVelocity(velocity, currentValue, targetValue) {
  if (currentValue === targetValue) {
    return 0
  }
  return velocity / (targetValue - currentValue)
}

function project(initialVelocity, decelerationRate) {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate)
}
