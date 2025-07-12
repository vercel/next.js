import { useMemo, useRef, type CSSProperties } from 'react'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import { ResizeHandle } from '../components/devtools-panel/resize/resize-handle'
import { ResizeProvider } from '../components/devtools-panel/resize/resize-provider'
import {
  DragHandle,
  DragProvider,
} from '../components/errors/dev-tools-indicator/drag-context'
import { Draggable } from '../components/errors/dev-tools-indicator/draggable'
import { useClickOutside } from '../components/errors/dev-tools-indicator/utils'
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

function getStoredPanelSize(name?: string) {
  const key = name ? name : `${STORE_KEY_PANEL_SIZE_PREFIX}_${name}`
  const defaultSize = { width: 450, height: 350 }
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!stored) {
      return defaultSize
    }
    if (
      typeof stored === 'object' &&
      'height' in stored &&
      'width' in stored &&
      typeof stored.height === 'number' &&
      typeof stored.width === 'number'
    ) {
      return {
        width: stored.width as number,
        height: stored.height as number,
      }
    }
    return defaultSize
  } catch {
    return defaultSize
  }
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
  // todo: allow strings w/ css units
  sizeConfig?:
    | {
        kind: 'resizable'
        minWidth: number
        minHeight: number
        maxWidth: number
        maxHeight: number
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
  const resizeRef = useRef<HTMLDivElement>(null)
  const { triggerRef } = usePanelRouterContext()

  useClickOutside(resizeRef, triggerRef, closeOnClickOutside && mounted, () => {
    setPanel('panel-selector')
  })

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

  const minWidth =
    sizeConfig.kind === 'resizable' ? sizeConfig.minWidth : undefined
  const minHeight =
    sizeConfig.kind === 'resizable' ? sizeConfig.minHeight : undefined
  const maxWidth =
    sizeConfig.kind === 'resizable' ? sizeConfig.maxWidth : undefined
  const maxHeight =
    sizeConfig.kind === 'resizable' ? sizeConfig.maxHeight : undefined

  const panelSize = useMemo(() => getStoredPanelSize(name), [name])

  return (
    <ResizeProvider
      value={{
        resizeRef,
        initialSize:
          sizeConfig.kind === 'resizable' ? sizeConfig.initialSize : sizeConfig,
        minWidth,
        minHeight,
        devToolsPosition: state.devToolsPosition,
        storageKey: resizeStorageKey,
      }}
    >
      <div
        tabIndex={-1}
        ref={resizeRef}
        style={{
          position: 'fixed',
          zIndex: 2147483646,
          outline: 'none',

          ...positionStyle,
          ...(sizeConfig.kind === 'resizable'
            ? {
                minWidth,
                minHeight,
                maxWidth,
                maxHeight,
              }
            : {
                height: panelSize.height,
                width: panelSize.width,
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
            position={devtoolsPanelPosition}
            setPosition={(p) => {
              if (sizeConfig.kind === 'resizable') {
                localStorage.setItem(positionStorageKey, p)
              }
              dispatch({
                type: ACTION_DEVTOOLS_PANEL_POSITION,
                devToolsPanelPosition: p,
                key: positionStorageKey,
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
                  ...containerProps?.style,
                }}
              >
                <DragHandle>{header}</DragHandle>
                {children}
              </div>
              {sizeConfig.kind === 'resizable' && (
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
