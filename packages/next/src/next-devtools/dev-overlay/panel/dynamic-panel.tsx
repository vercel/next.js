import { useRef, useState, useEffect, type CSSProperties } from 'react'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import { ResizeHandle } from '../components/devtools-panel/resize/resize-handle'
import { ResizeProvider } from '../components/devtools-panel/resize/resize-provider'
import {
  DragHandle,
  DragProvider,
} from '../components/errors/dev-tools-indicator/drag-context'
import { Draggable } from '../components/errors/dev-tools-indicator/draggable'
import { useClickOutsideAndEscape } from '../components/errors/dev-tools-indicator/utils'
import { usePanelRouterContext } from '../menu/context'
import { usePanelContext } from '../menu/panel-router'
import {
  ACTION_DEVTOOLS_PANEL_POSITION,
  STORAGE_KEY_PANEL_POSITION_PREFIX,
  STORE_KEY_PANEL_SIZE_PREFIX,
  STORE_KEY_SHARED_PANEL_LOCATION,
  STORE_KEY_SHARED_PANEL_SIZE,
} from '../shared'
import { getIndicatorOffset } from '../utils/indicator-metrics'
import { saveDevToolsConfig } from '../utils/save-devtools-config'
import './dynamic-panel.css'

function resolveCSSValue(
  value: string | number,
  dimension: 'width' | 'height' = 'width'
): number {
  if (typeof value === 'number') return value

  // kinda hacky, might be a better way to do this
  const temp = document.createElement('div')
  temp.style.position = 'absolute'
  temp.style.visibility = 'hidden'
  if (dimension === 'width') {
    temp.style.width = value
  } else {
    temp.style.height = value
  }
  document.body.appendChild(temp)
  const pixels = dimension === 'width' ? temp.offsetWidth : temp.offsetHeight
  document.body.removeChild(temp)
  return pixels
}

function useResolvedDimensions(
  minWidth?: string | number,
  minHeight?: string | number,
  maxWidth?: string | number,
  maxHeight?: string | number
) {
  const [dimensions, setDimensions] = useState(() => ({
    minWidth: minWidth ? resolveCSSValue(minWidth, 'width') : undefined,
    minHeight: minHeight ? resolveCSSValue(minHeight, 'height') : undefined,
    maxWidth: maxWidth ? resolveCSSValue(maxWidth, 'width') : undefined,
    maxHeight: maxHeight ? resolveCSSValue(maxHeight, 'height') : undefined,
  }))

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        minWidth: minWidth ? resolveCSSValue(minWidth, 'width') : undefined,
        minHeight: minHeight ? resolveCSSValue(minHeight, 'height') : undefined,
        maxWidth: maxWidth ? resolveCSSValue(maxWidth, 'width') : undefined,
        maxHeight: maxHeight ? resolveCSSValue(maxHeight, 'height') : undefined,
      })
    }

    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [minWidth, minHeight, maxWidth, maxHeight])

  return dimensions
}

export function DynamicPanel({
  header,
  children,
  draggable = false,
  sizeConfig = {
    kind: 'resizable',
    minWidth: 400,
    minHeight: 350,
    maxWidth: 1000,
    maxHeight: 1000,
    initialSize: {
      height: 400,
      width: 500,
    },
  },
  closeOnClickOutside = false,
  sharePanelSizeGlobally = true,
  sharePanelPositionGlobally = true,
  containerProps,
}: {
  header: React.ReactNode
  children: React.ReactNode
  draggable?: boolean
  sharePanelSizeGlobally?: boolean
  sharePanelPositionGlobally?: boolean
  containerProps?: React.HTMLProps<HTMLDivElement>
  sizeConfig?:
    | {
        kind: 'resizable'
        minWidth: string | number
        minHeight: string | number
        maxWidth: string | number
        maxHeight: string | number
        initialSize: { height: number; width: number }
        sides?: Array<'horizontal' | 'vertical' | 'diagonal'>
      }
    | {
        kind: 'fixed'
        height: number
        width: number
      }
  closeOnClickOutside?: boolean
}) {
  const { setPanel } = usePanelRouterContext()
  const { name, mounted } = usePanelContext()
  const resizeStorageKey = sharePanelSizeGlobally
    ? STORE_KEY_SHARED_PANEL_SIZE
    : `${STORE_KEY_PANEL_SIZE_PREFIX}_${name}`

  const positionStorageKey = sharePanelPositionGlobally
    ? STORE_KEY_SHARED_PANEL_LOCATION
    : `${STORAGE_KEY_PANEL_POSITION_PREFIX}_${name}`

  const { dispatch, state } = useDevOverlayContext()
  const devtoolsPanelPosition =
    state.devToolsPanelPosition[positionStorageKey] ?? state.devToolsPosition
  const [panelVertical, panelHorizontal] = devtoolsPanelPosition.split('-', 2)
  const resizeContainerRef = useRef<HTMLDivElement>(null)
  const { triggerRef } = usePanelRouterContext()

  useClickOutsideAndEscape(
    resizeContainerRef,
    triggerRef,
    mounted,
    (reason) => {
      switch (reason) {
        case 'escape': {
          setPanel('panel-selector')
          return
        }
        case 'outside': {
          if (closeOnClickOutside) {
            setPanel('panel-selector')
          }
          return
        }
        default: {
          return null!
        }
      }
    }
  )

  const indicatorOffset = getIndicatorOffset(state)

  const [indicatorVertical, indicatorHorizontal] = state.devToolsPosition.split(
    '-',
    2
  )

  const verticalOffset =
    panelVertical === indicatorVertical &&
    panelHorizontal === indicatorHorizontal
      ? indicatorOffset
      : INDICATOR_PADDING

  const positionStyle = {
    [panelVertical]: `${verticalOffset}px`,
    [panelHorizontal]: `${INDICATOR_PADDING}px`,
    [panelVertical === 'top' ? 'bottom' : 'top']: 'auto',
    [panelHorizontal === 'left' ? 'right' : 'left']: 'auto',
  } as CSSProperties

  const isResizable = sizeConfig.kind === 'resizable'

  const resolvedDimensions = useResolvedDimensions(
    isResizable ? sizeConfig.minWidth : undefined,
    isResizable ? sizeConfig.minHeight : undefined,
    isResizable ? sizeConfig.maxWidth : undefined,
    isResizable ? sizeConfig.maxHeight : undefined
  )

  const minWidth = resolvedDimensions.minWidth
  const minHeight = resolvedDimensions.minHeight
  const maxWidth = resolvedDimensions.maxWidth
  const maxHeight = resolvedDimensions.maxHeight

  const panelSizeKey = name
    ? `${STORE_KEY_PANEL_SIZE_PREFIX}_${name}`
    : STORE_KEY_SHARED_PANEL_SIZE
  const panelSize = state.devToolsPanelSize[panelSizeKey]

  return (
    <ResizeProvider
      value={{
        resizeRef: resizeContainerRef,
        initialSize:
          sizeConfig.kind === 'resizable' ? sizeConfig.initialSize : sizeConfig,
        minWidth,
        minHeight,
        maxWidth,
        maxHeight,
        devToolsPosition: state.devToolsPosition,
        devToolsPanelSize: state.devToolsPanelSize,
        storageKey: resizeStorageKey,
      }}
    >
      <div
        tabIndex={-1}
        ref={resizeContainerRef}
        className="dynamic-panel-container"
        style={
          {
            '--panel-top': positionStyle.top,
            '--panel-bottom': positionStyle.bottom,
            '--panel-left': positionStyle.left,
            '--panel-right': positionStyle.right,
            ...(isResizable
              ? {
                  '--panel-min-width': minWidth ? `${minWidth}px` : undefined,
                  '--panel-min-height': minHeight
                    ? `${minHeight}px`
                    : undefined,
                  '--panel-max-width': maxWidth ? `${maxWidth}px` : undefined,
                  '--panel-max-height': maxHeight
                    ? `${maxHeight}px`
                    : undefined,
                }
              : {
                  '--panel-height': `${panelSize ? panelSize.height : sizeConfig.height}px`,
                  '--panel-width': `${panelSize ? panelSize.width : sizeConfig.width}px`,
                }),
          } as React.CSSProperties & Record<string, string | number | undefined>
        }
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
            position={devtoolsPanelPosition}
            setPosition={(p) => {
              dispatch({
                type: ACTION_DEVTOOLS_PANEL_POSITION,
                devToolsPanelPosition: p,
                key: positionStorageKey,
              })

              if (sizeConfig.kind === 'resizable') {
                saveDevToolsConfig({
                  devToolsPanelPosition: {
                    [positionStorageKey]: p,
                  },
                })
              }
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
                className={`panel-content-container ${containerProps?.className || ''}`}
                style={{
                  ...containerProps?.style,
                }}
              >
                <DragHandle>{header}</DragHandle>
                <div
                  data-nextjs-scrollable-content
                  className="draggable-content"
                >
                  {children}
                </div>
              </div>
              {isResizable && (
                <>
                  {(!sizeConfig.sides ||
                    sizeConfig.sides.includes('vertical')) && (
                    <>
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="top"
                      />
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="bottom"
                      />
                    </>
                  )}
                  {(!sizeConfig.sides ||
                    sizeConfig.sides.includes('horizontal')) && (
                    <>
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="right"
                      />
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="left"
                      />
                    </>
                  )}
                  {(!sizeConfig.sides ||
                    sizeConfig.sides.includes('diagonal')) && (
                    <>
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="top-left"
                      />
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="top-right"
                      />
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="bottom-left"
                      />
                      <ResizeHandle
                        position={devtoolsPanelPosition}
                        direction="bottom-right"
                      />
                    </>
                  )}
                </>
              )}
            </>
          </Draggable>
        </DragProvider>
      </div>
    </ResizeProvider>
  )
}
