import { useEffect, useTransition } from 'react'
import { dispatcher } from '../../app/app-dev-overlay' with { 'turbopack-transition': 'nextjs-devtools' }

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
