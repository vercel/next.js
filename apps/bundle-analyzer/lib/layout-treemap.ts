import type { LayoutRect } from './treemap-layout'

export function layoutTreemap(sizes: number[], rect: LayoutRect): LayoutRect[] {
  if (sizes.length === 0) return []
  if (sizes.length === 1) return [rect]

  const totalSize = sizes.reduce((a, b) => a + b, 0)
  const normalizedSizes = sizes.map(
    (s) => (s / totalSize) * rect.width * rect.height
  )

  const result: LayoutRect[] = []
  let remaining = [...normalizedSizes]
  let currentRect = { ...rect }
  let totalRemaining = remaining.reduce((a, b) => a + b, 0)

  while (remaining.length > 1) {
    // Decide orientation: vertical if wider, horizontal if taller
    const vertical = currentRect.width >= currentRect.height

    // Pick items until sum > total / count
    const picked: number[] = []
    let sum = 0

    for (const size of remaining) {
      picked.push(size)
      sum += size

      if (vertical) {
        const width = (currentRect.width * sum) / totalRemaining
        if (width > (currentRect.height / picked.length) * 0.9) {
          break
        }
      } else {
        const height = (currentRect.height * sum) / totalRemaining
        if (height > (currentRect.width / picked.length) * 0.9) {
          break
        }
      }
    }

    // Ensure at least one item is picked
    if (picked.length === 0) {
      picked.push(remaining[0])
      sum = remaining[0]
    }

    // Calculate the space used by this row/column
    const spaceRatio = sum / totalRemaining

    totalRemaining -= sum

    if (vertical) {
      // Items stacked vertically, filling full width
      const rowWidth = Math.round(spaceRatio * currentRect.width)
      let offsetY = 0

      for (let i = 0; i < picked.length; i++) {
        const size = picked[i]
        const itemHeight =
          i === picked.length - 1
            ? Math.round(currentRect.height - offsetY)
            : Math.round((size / sum) * currentRect.height)

        result.push({
          x: Math.round(currentRect.x),
          y: Math.round(currentRect.y + offsetY),
          width: rowWidth,
          height: itemHeight,
        })
        offsetY += itemHeight
      }

      // Update remaining rectangle
      currentRect = {
        x: Math.round(currentRect.x + rowWidth),
        y: Math.round(currentRect.y),
        width: Math.round(currentRect.width - rowWidth),
        height: Math.round(currentRect.height),
      }
    } else {
      // Items placed horizontally, filling full height
      const rowHeight = Math.round(spaceRatio * currentRect.height)
      let offsetX = 0

      for (let i = 0; i < picked.length; i++) {
        const size = picked[i]
        const itemWidth =
          i === picked.length - 1
            ? Math.round(currentRect.width - offsetX)
            : Math.round((size / sum) * currentRect.width)

        result.push({
          x: Math.round(currentRect.x + offsetX),
          y: Math.round(currentRect.y),
          width: itemWidth,
          height: rowHeight,
        })
        offsetX += itemWidth
      }

      // Update remaining rectangle
      currentRect = {
        x: Math.round(currentRect.x),
        y: Math.round(currentRect.y + rowHeight),
        width: Math.round(currentRect.width),
        height: Math.round(currentRect.height - rowHeight),
      }
    }

    // Remove picked items from remaining
    remaining = remaining.slice(picked.length)
  }

  // Last item fills remaining space
  if (remaining.length === 1) {
    result.push(currentRect)
  }

  return result
}
