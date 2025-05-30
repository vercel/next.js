import { useContext, useEffect, useTransition } from 'react'
import { AppDevOverlayDispatchContext } from '../../app/app-dev-overlay'
import {
  ACTION_RENDERING_INDICATOR_HIDE,
  ACTION_RENDERING_INDICATOR_SHOW,
} from '../../shared'

export const useAppDevRenderingIndicator = () => {
  const dispatch = useContext(AppDevOverlayDispatchContext)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // Only supported in App Router
    if (dispatch !== null) {
      if (isPending) {
        dispatch({ type: ACTION_RENDERING_INDICATOR_SHOW })
      } else {
        dispatch({ type: ACTION_RENDERING_INDICATOR_HIDE })
      }
    }
  }, [dispatch, isPending])

  return startTransition
}
