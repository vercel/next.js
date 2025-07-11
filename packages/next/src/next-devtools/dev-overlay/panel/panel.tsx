import { useMemo, useRef, type CSSProperties } from 'react'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { ResizeProvider } from '../components/devtools-panel/resize/resize-provider'
import { usePanelRouterContext } from '../menu/context'
import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import { getIndicatorOffset } from '../utils/indicator-metrics'
import { Draggable } from '../components/errors/dev-tools-indicator/draggable'
import {
  ACTION_DEVTOOLS_PANEL_POSITION,
  STORAGE_KEY_PANEL_POSITION,
  type Corners,
} from '../shared'
import { ResizeHandle } from '../components/devtools-panel/resize/resize-handle'
import {
  DragHandle,
  DragProvider,
} from '../components/errors/dev-tools-indicator/drag-context'
import { useClickOutside } from '../components/errors/dev-tools-indicator/utils'
import { usePanelContext } from '../menu/panel-router'

export function DynamicPanel({
  header,
  children,
  draggable = true,
  sizeConfig = {
    kind: 'resizable',
    minWidth: 400,
    minHeight: 350,
    maxWidth: 1000,
    maxHeight: 1000,
  },
  closeOnClickOutside = false,
  ...containerProps
}: {
  header: React.ReactNode
  children: React.ReactNode
  draggable?: boolean
  // todo: allow strings w/ css units
  sizeConfig?:
    | {
        kind: 'resizable'
        minWidth: number
        minHeight: number
        maxWidth: number
        maxHeight: number
      }
    | {
        kind: 'fixed'
        height: number
        width: number
      }
  closeOnClickOutside?: boolean
} & React.HTMLProps<HTMLDivElement>) {
  const { setPanel } = usePanelRouterContext()
  const { name } = usePanelContext()

  const { dispatch, state } = useDevOverlayContext()
  const storagePositionKey = `${STORAGE_KEY_PANEL_POSITION}-${name}`

  const panelPosition: string = useMemo(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem(storagePositionKey) ||
        state.devToolsPanelPosition ||
        state.devToolsPosition
      )
    }
    return state.devToolsPosition
  }, [storagePositionKey, state.devToolsPanelPosition, state.devToolsPosition])

  const [vertical, horizontal] = panelPosition.split('-', 2)
  const resizeRef = useRef<HTMLDivElement>(null)
  const { triggerRef } = usePanelRouterContext()

  useClickOutside(resizeRef, triggerRef, closeOnClickOutside, () => {
    setPanel('panel-selector')
  })

  const indicatorOffset = getIndicatorOffset(state)

  const [indicatorVertical, indicatorHorizontal] = state.devToolsPosition.split(
    '-',
    2
  )

  const verticalOffset =
    vertical === indicatorVertical && horizontal === indicatorHorizontal
      ? indicatorOffset
      : INDICATOR_PADDING

  const positionStyle = {
    [vertical]: `${verticalOffset}px`,
    [horizontal]: `${INDICATOR_PADDING}px`,
    [vertical === 'top' ? 'bottom' : 'top']: 'auto',
    [horizontal === 'left' ? 'right' : 'left']: 'auto',
  } as CSSProperties

  const isResizable = sizeConfig.kind === 'resizable'
  const minWidth = isResizable ? sizeConfig.minWidth : undefined
  const minHeight = isResizable ? sizeConfig.minHeight : undefined
  const maxWidth = isResizable ? sizeConfig.maxWidth : undefined
  const maxHeight = isResizable ? sizeConfig.maxHeight : undefined

  const fixedWidth = !isResizable ? sizeConfig.width : undefined
  const fixedHeight = !isResizable ? sizeConfig.height : undefined

  const resizeStorageKey = `${name}-panel-resize`

  const { storedWidth, storedHeight } = useMemo(() => {
    if (typeof window === 'undefined')
      return { storedWidth: undefined, storedHeight: undefined }
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(resizeStorageKey) || 'null'
      ) as { width?: number; height?: number } | null
      return {
        storedWidth: stored?.width,
        storedHeight: stored?.height,
      }
    } catch {
      return { storedWidth: undefined, storedHeight: undefined }
    }
  }, [resizeStorageKey])

  return (
    <ResizeProvider
      value={{
        resizeRef,

        minWidth,
        minHeight,
        devToolsPosition: state.devToolsPosition,
        storageKey: resizeStorageKey,
      }}
    >
      <div
        ref={resizeRef}
        style={{
          position: 'fixed',
          zIndex: 2147483646,

          ...positionStyle,
          ...(isResizable
            ? {
                minWidth,
                minHeight,
                maxWidth,
                maxHeight,
                width: storedWidth ? `${storedWidth}px` : undefined,
                height: storedHeight ? `${storedHeight}px` : undefined,
              }
            : {
                height: storedHeight ? `${storedHeight}px` : fixedHeight,
                width: storedWidth
                  ? `${storedWidth}px`
                  : fixedWidth !== undefined
                    ? fixedWidth
                    : '100%',
              }),
        }}
      >
        <DragProvider disabled={!draggable}>
          <Draggable
            dragHandleSelector=".resize-container"
            avoidZone={{
              corner: state.devToolsPosition,
              square: 25 / state.scale,
              padding: INDICATOR_PADDING,
            }}
            padding={INDICATOR_PADDING}
            onDragStart={() => {}}
            position={panelPosition as Corners}
            setPosition={(p) => {
              localStorage.setItem(storagePositionKey, p)
              dispatch({
                type: ACTION_DEVTOOLS_PANEL_POSITION,
                devToolsPanelPosition: p,
              })
            }}
            style={{
              overflow: 'auto',
              width: '100%',
              height: '100%',
            }}
            disableDrag={!draggable}
          >
            <>
              <div
                {...containerProps}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  border: '1px solid var(--color-gray-200)',
                  borderRadius: 'var(--rounded-xl)',
                  background: 'var(--color-background-100)',
                  overflow: 'auto',
                  ...containerProps.style,
                }}
              >
                <DragHandle>{header}</DragHandle>
                {children}
              </div>
              {isResizable && (
                <>
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="top"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="right"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="bottom"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="left"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="top-left"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="top-right"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="bottom-left"
                  />
                  <ResizeHandle
                    position={state.devToolsPanelPosition}
                    direction="bottom-right"
                  />
                </>
              )}
            </>
          </Draggable>
        </DragProvider>
      </div>
    </ResizeProvider>
  )
}
