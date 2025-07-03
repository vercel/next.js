import type { Corners } from '../../../shared'
import { useCallback, useLayoutEffect, useRef } from 'react'

interface Point {
  x: number
  y: number
}

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
  dragHandleSelector,
  disableDrag = false,
  ...props
}: {
  children: React.ReactElement
  position: Corners
  padding: number
  setPosition: (position: Corners) => void
  onDragStart?: () => void
  dragHandleSelector?: string
  disableDrag?: boolean
}) {
  const { ref, animate, ...drag } = useDrag({
    disabled: disableDrag,
    threshold: 5,
    onDragStart,
    onDragEnd,
    onAnimationEnd,
    dragHandleSelector,
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

  return (
    <div {...props} ref={ref} {...drag} style={{ touchAction: 'none' }}>
      {children}
    </div>
  )
}

interface UseDragOptions {
  disabled: boolean
  onDragStart?: () => void
  onDrag?: (translation: Point) => void
  onDragEnd?: (translation: Point, velocity: Point) => void
  onAnimationEnd?: (corner: Corner) => void
  threshold: number // Minimum movement before drag starts
  dragHandleSelector?: string
}

interface Velocity {
  position: Point
  timestamp: number
}

export function useDrag(options: UseDragOptions) {
  const ref = useRef<HTMLDivElement>(null)
  const machine = useRef<
    | { state: 'idle' | 'press' | 'drag-end' }
    | { state: 'drag'; pointerId: number }
  >({
    state: 'idle',
  })
  const cleanup = useRef<() => void>(null)

  const origin = useRef<Point>({ x: 0, y: 0 })
  const translation = useRef<Point>({ x: 0, y: 0 })
  const lastTimestamp = useRef(0)
  const velocities = useRef<Velocity[]>([])

  const cancel = useCallback(() => {
    if (machine.current.state === 'drag') {
      ref.current?.releasePointerCapture(machine.current.pointerId)
    }

    machine.current =
      machine.current.state === 'drag'
        ? { state: 'drag-end' }
        : { state: 'idle' }

    if (cleanup.current !== null) {
      cleanup.current()
      cleanup.current = null
    }

    velocities.current = []

    ref.current?.classList.remove('dev-tools-grabbing')
  }, [])

  useLayoutEffect(() => {
    if (options.disabled) {
      cancel()
    }
  }, [cancel, options.disabled])

  function set(position: Point) {
    if (ref.current) {
      translation.current = position
      ref.current.style.translate = `${position.x}px ${position.y}px`
    }
  }

  function animate(corner: Corner) {
    const el = ref.current
    if (el === null) return

    function listener(e: TransitionEvent) {
      if (e.propertyName === 'translate') {
        options.onAnimationEnd?.(corner)
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
    if (machine.current.state === 'drag-end') {
      e.preventDefault()
      e.stopPropagation()
      machine.current = { state: 'idle' }
      ref.current?.removeEventListener('click', onClick)
    }
  }

  function isValidDragHandle(target: EventTarget | null): boolean {
    if (!options.dragHandleSelector || !ref.current || !target) {
      return true // If no selector provided, entire element is draggable
    }

    const element = target as Element
    if (!element.matches) {
      return false
    }

    // Check if the target element directly matches the drag handle selector
    // This excludes children elements, only allowing drag from the exact element
    return element.matches(options.dragHandleSelector)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) {
      return // ignore right click
    }

    // Check if the pointer down event is on a valid drag handle
    if (!isValidDragHandle(e.target)) {
      return
    }

    origin.current = { x: e.clientX, y: e.clientY }
    machine.current = { state: 'press' }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    if (cleanup.current !== null) {
      cleanup.current()
      cleanup.current = null
    }
    cleanup.current = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    ref.current?.addEventListener('click', onClick)
  }

  function onPointerMove(e: PointerEvent) {
    if (machine.current.state === 'press') {
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance >= options.threshold) {
        machine.current = { state: 'drag', pointerId: e.pointerId }
        ref.current?.setPointerCapture(e.pointerId)
        ref.current?.classList.add('dev-tools-grabbing')
        options.onDragStart?.()
      }
    }

    if (machine.current.state !== 'drag') return

    const currentPosition = { x: e.clientX, y: e.clientY }

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
    const now = Date.now()
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

  function onPointerUp() {
    const velocity = calculateVelocity(velocities.current)

    cancel()

    // TODO: This is the onDragEnd when the pointerdown event was fired not the onDragEnd when the pointerup event was fired
    options.onDragEnd?.(translation.current, velocity)
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
