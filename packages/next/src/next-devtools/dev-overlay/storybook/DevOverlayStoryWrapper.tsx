import { DevOverlay } from '../dev-overlay'
import { DevOverlayContext } from '../../dev-overlay.browser'
import {
  useStorybookOverlayReducer,
  storybookDefaultOverlayState,
} from './use-overlay-reducer'
import type { OverlayState } from '../shared'
import type { ReadyRuntimeError } from '../utils/get-error-by-type'

type WrapperProps = {
  initialState?: Partial<OverlayState>
  runtimeErrors?: ReadyRuntimeError[]
  children?: never
}
// todo: wrap stories in this so props are configurable
export function DevOverlayStoryWrapper({ initialState }: WrapperProps) {
  const mergedState: OverlayState = {
    ...storybookDefaultOverlayState,
    ...initialState,
  } as OverlayState

  const [state, dispatch] = useStorybookOverlayReducer(mergedState)
  return (
    <DevOverlayContext
      value={{ state, dispatch, getSquashedHydrationErrorDetails: () => null }}
    >
      <DevOverlay
        state={state}
        dispatch={dispatch}
        getSquashedHydrationErrorDetails={() => null}
      />
    </DevOverlayContext>
  )
}
