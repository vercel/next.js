import { useEffect, useTransition } from 'react'
import { dispatcher } from '../../app/app-dev-overlay'

export const useAppDevRenderIndicator = () => {
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (isPending) {
      dispatcher.renderIndicatorShow()
    } else {
      dispatcher.renderIndicatorHide()
    }
  }, [isPending])

  return startTransition
}
