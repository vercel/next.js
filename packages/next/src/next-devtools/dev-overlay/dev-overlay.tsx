import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ShadowPortal } from './components/shadow-portal'
import { ComponentStyles } from './styles/component-styles'
import { ErrorOverlay } from './components/errors/error-overlay/error-overlay'
import { RenderError } from './container/runtime-error/render-error'
import { ScaleUpdater } from './styles/scale-updater'
import type { ReadyRuntimeError } from './utils/get-error-by-type'
import { DevToolsIndicator } from './components/devtools-indicator/devtools-indicator'
import { PanelRouter } from './menu/panel-router'
import { PanelRouterContext, type PanelStateKind } from './menu/context'
import { useDevOverlayContext } from '../dev-overlay.browser'
import { ACTION_INSTANT_ERRORS_CLEAR, type DispatcherEvent } from './shared'

export const RenderErrorContext = createContext<{
  runtimeErrors: ReadyRuntimeError[]
  totalErrorCount: number
}>(null!)

export const useRenderErrorContext = () => useContext(RenderErrorContext)

function useClearInstantErrorsOnNav(
  page: string,
  dispatch: (action: DispatcherEvent) => void
) {
  const previousPageRef = useRef(page)
  useEffect(() => {
    const previousPage = previousPageRef.current
    previousPageRef.current = page
    if (page === '' || page === previousPage) return
    dispatch({ type: ACTION_INSTANT_ERRORS_CLEAR, currentPath: page })
  }, [page, dispatch])
}

export function DevOverlay() {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const { state, dispatch, getSquashedHydrationErrorDetails } =
    useDevOverlayContext()
  const [panel, setPanel] = useState<null | PanelStateKind>(() =>
    state.instantNavs ? 'instant-navs' : null
  )

  useClearInstantErrorsOnNav(state.page, dispatch)

  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <ShadowPortal>
      <ScaleUpdater />
      <ComponentStyles />

      <RenderError state={state} isAppDir={true}>
        {({ runtimeErrors, totalErrorCount }) => {
          return (
            <>
              {state.showIndicator ? (
                <>
                  <RenderErrorContext
                    value={{ runtimeErrors, totalErrorCount }}
                  >
                    <PanelRouterContext
                      value={{
                        panel,
                        setPanel,
                        triggerRef,
                        selectedIndex,
                        setSelectedIndex,
                      }}
                    >
                      <ErrorOverlay
                        state={state}
                        dispatch={dispatch}
                        getSquashedHydrationErrorDetails={
                          getSquashedHydrationErrorDetails
                        }
                        runtimeErrors={runtimeErrors}
                        errorCount={totalErrorCount}
                      />
                      <PanelRouter />
                      <DevToolsIndicator />
                    </PanelRouterContext>
                  </RenderErrorContext>
                </>
              ) : null}
            </>
          )
        }}
      </RenderError>
    </ShadowPortal>
  )
}
