import { useEffect, useState } from 'react'

export function useMeasureWidth(
  ref: React.RefObject<HTMLDivElement | null>
): number {
  const [width, setWidth] = useState<number>(0)

  useEffect(() => {
    const el = ref.current

    if (!el) {
      return
    }

    const observer = new ResizeObserver(([{ contentRect }]) => {
      setWidth(contentRect.width)
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}
