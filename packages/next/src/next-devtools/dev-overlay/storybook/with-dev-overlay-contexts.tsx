import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  DevOverlayContext,
  useDevOverlayContext,
} from '../../dev-overlay.browser'
import { RenderErrorContext } from '../dev-overlay'
import { PanelRouterContext, type PanelStateKind } from '../menu/context'
import { INITIAL_OVERLAY_STATE } from '../shared'
import type { OverlayState, DispatcherEvent } from '../shared'
import type { ReadyRuntimeError } from '../utils/get-error-by-type'

interface WithDevOverlayContextsOptions {
  state?: Partial<OverlayState>
  dispatch?: (action: DispatcherEvent) => void
  runtimeErrors?: ReadyRuntimeError[]
  totalErrorCount?: number
  panel?: PanelStateKind | null
  setPanel?: Dispatch<SetStateAction<PanelStateKind | null>>
  selectedIndex?: number
  setSelectedIndex?: Dispatch<SetStateAction<number>>
  shadowRoot?: ShadowRoot
}

export const withDevOverlayContexts =
  (options?: WithDevOverlayContextsOptions) => (Story: any) => {
    const parentContext = useDevOverlayContext()
    const [panel, setPanel] = useState<PanelStateKind | null>(
      options?.panel ?? null
    )
    const [selectedIndex, setSelectedIndex] = useState(
      options?.selectedIndex ?? -1
    )
    const triggerRef = useRef<HTMLButtonElement>(null)

    const defaultState: OverlayState = {
      ...INITIAL_OVERLAY_STATE,
      routerType: 'app',
      isErrorOverlayOpen: false,
      ...options?.state,
    }

    const defaultDispatch = options?.dispatch || (() => {})

    const shadowRoot = options?.shadowRoot ?? parentContext?.shadowRoot
    if (shadowRoot == null) {
      throw new Error(
        '`options.shadowRoot` is required without a parent context'
      )
    }

    return (
      <DevOverlayContext.Provider
        value={{
          state: defaultState,
          dispatch: defaultDispatch,
          getSquashedHydrationErrorDetails: () => null,
          shadowRoot,
        }}
      >
        <RenderErrorContext.Provider
          value={{
            runtimeErrors: options?.runtimeErrors ?? [],
            totalErrorCount: options?.totalErrorCount ?? 0,
          }}
        >
          <PanelRouterContext.Provider
            value={{
              panel,
              setPanel: options?.setPanel ?? setPanel,
              triggerRef,
              selectedIndex,
              setSelectedIndex: options?.setSelectedIndex ?? setSelectedIndex,
            }}
          >
            <Story />
          </PanelRouterContext.Provider>
        </RenderErrorContext.Provider>
      </DevOverlayContext.Provider>
    )
  }
