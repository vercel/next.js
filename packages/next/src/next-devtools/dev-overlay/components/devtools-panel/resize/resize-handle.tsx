import { useState, useLayoutEffect } from 'react'
import type { Corners } from '../../../shared'
import { useResize, type ResizeDirection } from './resize-provider'
import './resize-handle.css'
import { saveDevToolsConfig } from '../../../utils/save-devtools-config'

export const ResizeHandle = ({
  direction,
  position,
}: {
  direction: ResizeDirection
  position: Corners
}) => {
  const {
    resizeRef,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    storageKey,
    draggingDirection,
    setDraggingDirection,
  } = useResize()
  const [borderWidths, setBorderWidths] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  // TODO: NEXT-4645
  const shouldShowHandle = () => {
    const getOppositeCorner = (corner: Corners): ResizeDirection => {
      switch (corner) {
        case 'top-left':
          return 'bottom-right'
        case 'top-right':
          return 'bottom-left'
        case 'bottom-left':
          return 'top-right'
        case 'bottom-right':
          return 'top-left'
        default: {
          corner satisfies never
          return null!
        }
      }
    }

    // we block the sides of the corner its in (bottom-left has bottom and left sides blocked from resizing)
    // because there shouldn't be anywhere to resize, and if the user decides to resize from that point it
    // would be unhandled/slightly janky (the component would have to re-magnetic-snap after the resize)
    if (position.split('-').includes(direction)) return false

    // same logic as above, but the only corner resize that makes
    // sense is the corner fully exposed (the opposing corner)
    const isCorner = direction.includes('-')
    if (isCorner) {
      const opposite = getOppositeCorner(position)
      return direction === opposite
    }

    return true
  }

  // we want the resize lines to be flush with the entire true width of the containers box
  // and we don't want the user of ResizeHandle to have to tell us the border width
  useLayoutEffect(() => {
    if (!resizeRef.current) return

    const element = resizeRef.current
    const computedStyle = window.getComputedStyle(element)

    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0

    // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO
    setBorderWidths({
      top: borderTop,
      right: borderRight,
      bottom: borderBottom,
      left: borderLeft,
    })
  }, [resizeRef])

  const handleMouseDown = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault()
    if (!resizeRef.current) return
    setDraggingDirection(direction)

    const element = resizeRef.current
    const initialRect = element.getBoundingClientRect()
    const startX = mouseDownEvent.clientX
    const startY = mouseDownEvent.clientY

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX
      const deltaY = mouseMoveEvent.clientY - startY

      const { newWidth, newHeight } = getNewDimensions(
        direction,
        deltaX,
        deltaY,
        initialRect,
        minWidth,
        minHeight,
        maxWidth,
        maxHeight
      )

      if (newWidth !== undefined) {
        element.style.width = `${newWidth}px`
      }
      if (newHeight !== undefined) {
        element.style.height = `${newHeight}px`
      }
    }

    const handleMouseUp = () => {
      setDraggingDirection(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (!resizeRef.current) {
        // possible if the user closes during drag
        return
      }

      const { width, height } = resizeRef.current.getBoundingClientRect()
      saveDevToolsConfig({
        devToolsPanelSize: { [storageKey]: { width, height } },
      })
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  if (!shouldShowHandle()) {
    return null
  }
  const totalHorizontalBorder = borderWidths.left + borderWidths.right
  const totalVerticalBorder = borderWidths.top + borderWidths.bottom

  const isCornerHandle = direction.includes('-')

  return (
    <>
      {/* this is what actually captures the events, its partially on the container, and partially off */}
      <div
        className={`resize-container ${direction} ${draggingDirection && draggingDirection !== direction ? 'no-hover' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {/* this panel appears to capture the click, but its just a visual indicator for user of the resize target */}
      {!isCornerHandle && (
        <div
          className={`resize-line ${direction} ${draggingDirection === direction ? 'dragging' : ''}`}
          style={
            {
              // We want the resize line to appear to come out of the back
              // of the div flush with the full box, otherwise there are a
              // few px missing and it looks jank
              '--border-horizontal': `${totalHorizontalBorder}px`,
              '--border-vertical': `${totalVerticalBorder}px`,
              '--border-top': `${borderWidths.top}px`,
              '--border-right': `${borderWidths.right}px`,
              '--border-bottom': `${borderWidths.bottom}px`,
              '--border-left': `${borderWidths.left}px`,
            } as React.CSSProperties
          }
        />
      )}
    </>
  )
}

const getNewDimensions = (
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
  initialRect: DOMRect,
  minWidth: number,
  minHeight: number,
  maxWidth?: number,
  maxHeight?: number
) => {
  const effectiveMaxWidth = maxWidth ?? window.innerWidth * 0.95
  const effectiveMaxHeight = maxHeight ?? window.innerHeight * 0.95

  switch (direction) {
    case 'right':
      return {
        newWidth: Math.min(
          effectiveMaxWidth,
          Math.max(minWidth, initialRect.width + deltaX)
        ),
        newHeight: initialRect.height,
      }

    case 'left': {
      return {
        newWidth: Math.min(
          effectiveMaxWidth,
          Math.max(minWidth, initialRect.width - deltaX)
        ),
        newHeight: initialRect.height,
      }
    }

    case 'bottom':
      return {
        newWidth: initialRect.width,
        newHeight: Math.min(
          effectiveMaxHeight,
          Math.max(minHeight, initialRect.height + deltaY)
        ),
      }

    case 'top': {
      return {
        newWidth: initialRect.width,
        newHeight: Math.min(
          effectiveMaxHeight,
          Math.max(minHeight, initialRect.height - deltaY)
        ),
      }
    }

    case 'top-left': {
      return {
        newWidth: Math.min(
          effectiveMaxWidth,
          Math.max(minWidth, initialRect.width - deltaX)
        ),
        newHeight: Math.min(
          effectiveMaxHeight,
          Math.max(minHeight, initialRect.height - deltaY)
        ),
      }
    }

    case 'top-right': {
      return {
        newWidth: Math.min(
          effectiveMaxWidth,
          Math.max(minWidth, initialRect.width + deltaX)
        ),
        newHeight: Math.min(
          effectiveMaxHeight,
          Math.max(minHeight, initialRect.height - deltaY)
        ),
      }
    }

    case 'bottom-left': {
      return {
        newWidth: Math.min(
          effectiveMaxWidth,
          Math.max(minWidth, initialRect.width - deltaX)
        ),
        newHeight: Math.min(
          effectiveMaxHeight,
          Math.max(minHeight, initialRect.height + deltaY)
        ),
      }
    }

    case 'bottom-right':
      return {
        newWidth: Math.min(
          effectiveMaxWidth,
          Math.max(minWidth, initialRect.width + deltaX)
        ),
        newHeight: Math.min(
          effectiveMaxHeight,
          Math.max(minHeight, initialRect.height + deltaY)
        ),
      }
    default: {
      direction satisfies never
      return null!
    }
  }
}
