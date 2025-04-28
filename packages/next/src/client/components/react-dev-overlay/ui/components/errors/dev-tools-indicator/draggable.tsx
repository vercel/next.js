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
      const projectedPosition = {
        x: translation.x + project(velocity.x),
        y: translation.y + project(velocity.y),
      }

      const nearestCorner = getNearestCorner(projectedPosition)
      animate(nearestCorner)
    },
    onAnimationEnd: ({ corner }: Corner) => {
      // Unset drag translation
      // ref.current.style.transition = 'none'
      console.log('animating', animating)
      setTimeout(() => {
        ref.current.style.translate = 'none'
        setCurrentCorner(corner)
      })
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
  // How many px to move before we initiate dragging
  const { threshold = 10 } = options

  const ref = useRef<HTMLDivElement>(null)
  const state = useRef<'idle' | 'press' | 'drag'>('idle')

  const origin = useRef<Point>({ x: 0, y: 0 })
  const translation = useRef<Point>({ x: 0, y: 0 })
  const lastTimestamp = useRef(0)
  const velocities = useRef<Velocity[]>([])
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (state.current === 'press') {
        const dx = e.clientX - origin.current.x
        const dy = e.clientY - origin.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (state.current === 'press' && distance >= threshold) {
          state.current = 'drag'
          ref.current!.style.pointerEvents = 'none'
          ref.current?.setPointerCapture(e.pointerId)
        }
      }

      if (state.current !== 'drag') return

      const currentPosition = { x: e.clientX, y: e.clientY }
      const now = Date.now()

      const dx = currentPosition.x - origin.current.x
      const dy = currentPosition.y - origin.current.y
      origin.current = currentPosition

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

    window.addEventListener('pointermove', onPointerMove)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    origin.current = { x: e.clientX, y: e.clientY }
    state.current = 'press'
  }

  function onPointerUp(e: React.PointerEvent) {
    state.current = 'idle'
    ref.current!.style.pointerEvents = ''
    const velocity = calculateVelocity(velocities.current)
    options.onDragEnd?.(translation.current, velocity)
    velocities.current = []
    if (ref.current) {
      ref.current.releasePointerCapture(e.pointerId)
    }
  }

  function onPointerCancel() {
    state.current = 'idle'
    velocities.current = []
  }

  return {
    ref,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    animate,
    animating,
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
