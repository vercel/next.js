import { useEffect, useRef, useState, forwardRef } from 'react'

export const Resizer = forwardRef(function Resizer(
  {
    children,
    measure,
    ...props
  }: {
    children: React.ReactNode
    measure: boolean
  } & React.HTMLProps<HTMLDivElement>,
  resizerRef: React.Ref<HTMLDivElement | null>
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [height, measuring] = useMeasureHeight(ref, measure)

  return (
    <div
      {...props}
      ref={resizerRef}
      // [x] Don't animate on initial load
      // [x] No duplicate elements
      // [x] Responds to content growth
      style={{
        height: measuring ? 'auto' : height,
        transition: 'height 250ms var(--timing-swift)',
      }}
    >
      <div ref={ref}>{children}</div>
    </div>
  )
})

function useMeasureHeight(
  ref: React.RefObject<HTMLDivElement | null>,
  measure: boolean
): [number, boolean] {
  const [height, setHeight] = useState<number>(0)
  const [measuring, setMeasuring] = useState<boolean>(true)

  useEffect(() => {
    if (!measure) {
      return
    }

    let timerId: number
    const el = ref.current

    if (!el) {
      return
    }

    const observer = new ResizeObserver(([{ contentRect }]) => {
      clearTimeout(timerId)

      timerId = window.setTimeout(() => {
        setMeasuring(false)
      }, 100)

      setHeight(contentRect.height)
    })

    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure])

  return [height, measuring]
}
