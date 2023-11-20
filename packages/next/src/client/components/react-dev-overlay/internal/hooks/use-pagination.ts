import * as React from 'react'

export type PaginationActions = {
  previous: (e?: React.KeyboardEvent | React.MouseEvent) => void
  next: (e?: React.KeyboardEvent | React.MouseEvent) => void
  setIdx: React.Dispatch<React.SetStateAction<number>>
}

export function usePagination<T>(
  items: T[],
  defaultIdx: number = 0
): [T | null, PaginationActions, number] {
  const [idx, setIdx] = React.useState(defaultIdx)

  React.useEffect(() => {
    if (idx >= items.length && idx > 0) {
      setIdx(items.length - 1)
    }
  }, [idx, items.length])

  const currentItem = React.useMemo(() => {
    return items[idx] ?? null
  }, [items, idx])

  const actions = React.useMemo(
    () => ({
      previous: (e?: React.KeyboardEvent | React.MouseEvent) => {
        e?.preventDefault()
        setIdx((oldIdx) => Math.max(0, oldIdx - 1))
      },
      next: (e?: React.KeyboardEvent | React.MouseEvent) => {
        e?.preventDefault()
        setIdx((oldIdx) => Math.max(0, Math.min(items.length - 1, oldIdx + 1)))
      },
      setIdx,
    }),
    [items.length]
  )

  return [currentItem, actions, idx]
}
