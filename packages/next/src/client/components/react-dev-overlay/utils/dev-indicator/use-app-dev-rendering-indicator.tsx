import { useEffect, useTransition } from 'react'
import { dispatcher } from '../../app/app-dev-overlay'

export const useAppDevRenderingIndicator = () => {
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (isPending) {
      dispatcher.renderingIndicatorShow()
    } else {
      dispatcher.renderingIndicatorHide()
    }
  }, [isPending])

  return startTransition
}
