import { forwardRef, useEffect, useState, type Key } from 'react'

export const Resizer = forwardRef(function Resizer(
  {
    children,
    contentKey,
    ...props
  }: React.HTMLProps<HTMLDivElement> & { contentKey?: Key },
  resizerRef: React.Ref<HTMLDivElement | null>
) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [measurement, setMeasurement] = useState<{
    height: number
    contentKey: Key | undefined
  }>()

  useEffect(() => {
    if (!element) {
      return
    }

    const observer = new ResizeObserver(([{ contentRect }]) => {
      setMeasurement({ height: contentRect.height, contentKey })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [element, contentKey])

  const height =
    measurement?.contentKey === contentKey ? measurement?.height : undefined

  return (
    <div {...props} ref={resizerRef} style={{ height }}>
      <div ref={setElement}>{children}</div>
    </div>
  )
})
