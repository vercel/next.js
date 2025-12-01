import {
  createContext,
  useCallback,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react'
import { STORE_KEY_SHARED_PANEL_SIZE, type Corners } from '../../../shared'

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
  maxWidth?: number
  maxHeight?: number
  draggingDirection: ResizeDirection | null
  setDraggingDirection: (direction: ResizeDirection | null) => void
  storageKey: string
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

interface ResizeProviderProps {
  value: {
    resizeRef: RefObject<HTMLElement | null>
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
    devToolsPosition: Corners
    devToolsPanelSize: Record<string, { width: number; height: number }>
    storageKey?: string
    initialSize?: { height: number; width: number }
  }
  children: React.ReactNode
}

export const ResizeProvider = ({ value, children }: ResizeProviderProps) => {
  const minWidth = value.minWidth ?? 100
  const minHeight = value.minHeight ?? 80
  const maxWidth = value.maxWidth
  const maxHeight = value.maxHeight
  const [draggingDirection, setDraggingDirection] =
    useState<ResizeDirection | null>(null)

  const storageKey = value.storageKey ?? STORE_KEY_SHARED_PANEL_SIZE

  const { resizeRef } = value
  const applyConstrainedDimensions = useCallback(() => {
    if (!resizeRef.current) return

    // this feels weird to read local storage on resize, but we don't
    // track the dimensions of the container, and this is better than
    // getBoundingClientReact

    // an optimization if this is too expensive is to maintain the current
    // container size in a ref and update it on resize, which is essentially
    // what we're doing here, just dumber
    if (draggingDirection !== null) {
      // Don't override live resizing operation with stale cached values.
      return
    }

    const dim = value.devToolsPanelSize[storageKey]
    if (!dim) {
      return
    }
    const { height, width } = constrainDimensions({
      ...dim,
      minWidth: minWidth ?? 100,
      minHeight: minHeight ?? 80,
    })

    resizeRef.current.style.width = `${width}px`
    resizeRef.current.style.height = `${height}px`
    return true
  }, [
    resizeRef,
    draggingDirection,
    storageKey,
    minWidth,
    minHeight,
    value.devToolsPanelSize,
  ])

  const fireInitialConstrainDimensions = useEffectEvent(() => {
    const applied = applyConstrainedDimensions()
    if (
      !applied &&
      resizeRef.current &&
      value.initialSize?.height &&
      value.initialSize.width
    ) {
      const { height, width } = constrainDimensions({
        height: value.initialSize.height,
        width: value.initialSize.width,
        minWidth: minWidth ?? 100,
        minHeight: minHeight ?? 80,
      })
      resizeRef.current.style.width = `${width}px`
      resizeRef.current.style.height = `${height}px`
    }
  })

  useLayoutEffect(() => {
    fireInitialConstrainDimensions()
  }, [])

  useLayoutEffect(() => {
    window.addEventListener('resize', applyConstrainedDimensions)
    return () =>
      window.removeEventListener('resize', applyConstrainedDimensions)
  }, [
    applyConstrainedDimensions,
    value.initialSize?.height,
    value.initialSize?.width,
    value.resizeRef,
  ])

  return (
    <ResizeContext.Provider
      value={{
        resizeRef: value.resizeRef,
        minWidth,
        minHeight,
        maxWidth,
        maxHeight,
        draggingDirection,
        setDraggingDirection,
        storageKey,
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
