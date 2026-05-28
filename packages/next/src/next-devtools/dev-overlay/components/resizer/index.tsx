import { forwardRef, useEffect, useState } from 'react'

export const Resizer = forwardRef(function Resizer(
  {
    children,
    measure,
    resetKey,
    ...props
  }: {
    children: React.ReactNode
    measure: boolean
    resetKey?: string | number
  } & React.HTMLProps<HTMLDivElement>,
  resizerRef: React.Ref<HTMLDivElement | null>
) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)

  const [previousResetKey, setPreviousResetKey] = useState(resetKey)
  const skipTransition = previousResetKey !== resetKey
  if (skipTransition) {
    setPreviousResetKey(resetKey)
  }

  const [height, measuring] = useMeasureHeight(element, measure, resetKey)

  return (
    <div
      {...props}
      ref={resizerRef}
      // [x] Don't animate on initial load
      // [x] No duplicate elements
      // [x] Responds to content growth
      style={{
        height: measuring ? 'auto' : height,
        transition:
          skipTransition || measuring
            ? 'none'
            : 'height 250ms var(--timing-swift)',
      }}
    >
      <div ref={setElement}>{children}</div>
    </div>
  )
})

function useMeasureHeight(
  element: HTMLDivElement | null,
  measure: boolean,
  resetKey?: string | number
): [number, boolean] {
  const [height, setHeight] = useState<number>(0)
  const [measuring, setMeasuring] = useState<boolean>(true)
  const [previousResetKey, setPreviousResetKey] = useState(resetKey)

  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey)
    setMeasuring(true)
  }

  useEffect(() => {
    if (!measure) {
      return
    }

    let timerId: number

    if (!element) {
      return
    }

    const observer = new ResizeObserver(([{ contentRect }]) => {
      clearTimeout(timerId)

      timerId = window.setTimeout(() => {
        setMeasuring(false)
      }, 100)

      setHeight(contentRect.height)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [measure, element])

  return [height, measuring]
}
