import { useRef, useState } from 'react'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { ResizeProvider } from '../components/devtools-panel/resize/resize-provider'
import { usePanelContext } from '../menu/context'
import { Overlay } from '../components/overlay'
import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import { Draggable } from '../components/errors/dev-tools-indicator/draggable'
import { ACTION_DEVTOOLS_POSITION, STORAGE_KEY_POSITION } from '../shared'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/dialog'
import { ResizeHandle } from '../components/devtools-panel/resize/resize-handle'

export function DevOverlayPanel({
  header,
  children,
}: {
  header: React.ReactNode
  children: React.ReactNode
}) {
  // might need this, we will see
  const [prevIsErrorOverlayOpen, setPrevIsErrorOverlayOpen] = useState(false)

  const { dispatch, state } = useDevOverlayContext()
  // i don't know if this is even needed with this state
  if (state.isErrorOverlayOpen !== prevIsErrorOverlayOpen) {
    if (state.isErrorOverlayOpen) {
      // We should always show the issues tab initially if we're
      // programmatically opening the panel to highlight errors.
    }
    setPrevIsErrorOverlayOpen(state.isErrorOverlayOpen)
  }

  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)
  const resizeRef = useRef<HTMLDivElement>(null)
  const onCloseDevToolsPanel = () => {
    // dispatch({ type: ACTION_DEVTOOLS_PANEL_CLOSE })
    // dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
  }

  // const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  //   dispatch({
  //     type: ACTION_DEVTOOLS_POSITION,
  //     devToolsPosition: e.target.value as Corners,
  //   })
  //   localStorage.setItem(STORAGE_KEY_POSITION, e.target.value)
  // }

  // was this for the settings? will need to sync later
  // const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  //   dispatch({
  //     type: ACTION_DEVTOOLS_SCALE,
  //     scale: Number(e.target.value),
  //   })
  //   localStorage.setItem(STORAGE_KEY_SCALE, e.target.value)
  // }

  // const handleFullscreenToggle = () => {
  //   setIsFullscreen((prev: any) => !prev)
  //   dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
  // }

  return (
    <ResizeProvider
      value={{
        resizeRef,
        minWidth: 400,
        minHeight: 350,
        devToolsPosition: state.devToolsPosition,
      }}
    >
      <Draggable
        data-nextjs-devtools-panel-draggable
        padding={INDICATOR_PADDING}
        onDragStart={() => {}}
        position={state.devToolsPosition}
        setPosition={(p) => {
          localStorage.setItem(STORAGE_KEY_POSITION, p)
          dispatch({
            type: ACTION_DEVTOOLS_POSITION,
            devToolsPosition: p,
          })
        }}
        dragHandleSelector="[data-nextjs-devtools-panel-header], [data-nextjs-devtools-panel-footer], [data-nextjs-devtools-panel-draggable]"
        // disableDrag={isFullscreen} <-- this will be useful later
      >
        <>
          {/* this really isn't a dialog, not sure if this is the right component 
         seems to be doing something so we shall leave it 
          */}
          <Dialog
            data-nextjs-devtools-panel-dialog
            aria-labelledby="nextjs__container_dev_tools_panel_label"
            aria-describedby="nextjs__container_dev_tools_panel_desc"
            onClose={onCloseDevToolsPanel}
          >
            <DialogContent
              data-nextjs-devtools-panel-footer
              data-nextjs-devtools-panel-draggable
              data-nextjs-devtools-panel-dialog-content
            >
              <DialogHeader
                style={{
                  width: '100%',
                }}
                data-nextjs-devtools-panel-dialog-header
              >
                {header}
              </DialogHeader>
              <DialogBody
                style={{
                  width: '100%',
                }}
                data-nextjs-devtools-panel-dialog-body
              >
                {children}
              </DialogBody>
            </DialogContent>
            {/* <DevToolsPanelFooter
                versionInfo={state.versionInfo}
                isDraggable={!isFullscreen}
                showRestartServerButton={state.showRestartServerButton}
              /> */}
          </Dialog>

          <ResizeHandle direction="top" />
          <ResizeHandle direction="right" />
          <ResizeHandle direction="bottom" />
          <ResizeHandle direction="left" />
          <ResizeHandle direction="top-left" />
          <ResizeHandle direction="top-right" />
          <ResizeHandle direction="bottom-left" />
          <ResizeHandle direction="bottom-right" />
        </>
      </Draggable>
    </ResizeProvider>
  )
}

// {/* what is overlay doing?? */}
// {/* i dont know if we need an overlay at all ,what is an overlay in this context? wut */}
// <Overlay
// ref={resizeRef}
// data-nextjs-devtools-panel-overlay
// style={
//   `${vertical}-${horizontal}` === 'bottom-left'
//       ? {
//           bottom: '40px',
//           // right: INDICATOR_PADDING,
//           top: 'auto',
//           right: 'auto',
//         }
//       : {
//           [vertical]: `${INDICATOR_PADDING}px`,
//           [horizontal]: `${INDICATOR_PADDING}px`,
//           [vertical === 'top' ? 'bottom' : 'top']: 'auto',
//           [horizontal === 'left' ? 'right' : 'left']: 'auto',
//         }

// }
// >
// {/* TODO: Investigate why onCloseDevToolsPanel on Dialog doesn't close when clicked outside. */}
// {/* i dont think we need a backdrop */}
// {/* <OverlayBackdrop
//   data-nextjs-devtools-panel-overlay-backdrop={isFullscreen}
//   onClick={onCloseDevToolsPanel}
// /> */}

// </Overlay>
