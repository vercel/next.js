import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react'
import type { Corners } from '../../../shared'
const STORAGE_KEY_DIMENSIONS = 'nextjs-devtools-dimensions'

export type ResizeDirection =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

interface ResizeContextValue {
  resizeRef: RefObject<HTMLElement | null>
  minWidth: number
  minHeight: number
  devToolsPosition: Corners
  draggingDirection: ResizeDirection | null
  setDraggingDirection: (direction: ResizeDirection | null) => void
}

const ResizeContext = createContext<ResizeContextValue>(null!)

const constrainDimensions = (params: {
  width: number
  height: number
  minWidth: number
  minHeight: number
}) => {
  const maxWidth = window.innerWidth * 0.95
  const maxHeight = window.innerHeight * 0.95

  return {
    width: Math.min(maxWidth, Math.max(params.minWidth, params.width)),
    height: Math.min(maxHeight, Math.max(params.minHeight, params.height)),
  }
}

const parseResizeLocalStorage = () => {
  const savedDimensions = localStorage.getItem(STORAGE_KEY_DIMENSIONS)
  if (!savedDimensions) return null
  try {
    const parsed = JSON.parse(savedDimensions)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return { width: parsed.width, height: parsed.height }
    }
    return null
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY_DIMENSIONS)
    return null
  }
}

interface ResizeProviderProps {
  value: {
    resizeRef: RefObject<HTMLElement | null>
    minWidth?: number
    minHeight?: number
    devToolsPosition: Corners
  }
  children: React.ReactNode
}

export const ResizeProvider = ({ value, children }: ResizeProviderProps) => {
  const minWidth = value.minWidth ?? 100
  const minHeight = value.minHeight ?? 80
  const [draggingDirection, setDraggingDirection] =
    useState<ResizeDirection | null>(null)

  useLayoutEffect(() => {
    const applyConstrainedDimensions = () => {
      if (!value.resizeRef.current) return

      // this feels weird to read local storage on resize, but we don't
      // track the dimensions of the container, and this is better than
      // getBoundingClientReact

      // an optimization if this is too expensive is to maintain the current
      // container size in a ref and update it on resize, which is essentially
      // what we're doing here, just dumber
      const dim = parseResizeLocalStorage()
      if (!dim) {
        return
      }
      const { height, width } = constrainDimensions({
        ...dim,
        minWidth: minWidth ?? 100,
        minHeight: minHeight ?? 80,
      })

      value.resizeRef.current.style.width = `${width}px`
      value.resizeRef.current.style.height = `${height}px`
    }

    applyConstrainedDimensions()

    window.addEventListener('resize', applyConstrainedDimensions)
    return () =>
      window.removeEventListener('resize', applyConstrainedDimensions)
  }, [value.resizeRef, minWidth, minHeight])

  return (
    <ResizeContext.Provider
      value={{
        resizeRef: value.resizeRef,
        minWidth,
        minHeight,
        devToolsPosition: value.devToolsPosition,
        draggingDirection,
        setDraggingDirection,
      }}
    >
      {children}
    </ResizeContext.Provider>
  )
}

export const useResize = () => {
  const context = useContext(ResizeContext)
  if (!context) {
    throw new Error('useResize must be used within a Resize provider')
  }
  return context
}
