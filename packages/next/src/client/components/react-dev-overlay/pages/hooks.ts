import React from 'react'
import { Router } from '../../../router'
import { renderPagesDevOverlay } from 'next/dist/compiled/next-devtools'
import { getComponentStack, getOwnerStack } from '../../errors/stitched-error'
import { isRecoverableError } from '../../../react-client-callbacks/on-recoverable-error'
import { getSquashedHydrationErrorDetails } from './hydration-error-state'

export const usePagesDevOverlayBridge = () => {
  React.useInsertionEffect(() => {
    // NDT uses a different React instance so it's not technically a state update
    // scheduled from useInsertionEffect.
    renderPagesDevOverlay(
      getComponentStack,
      getOwnerStack,
      getSquashedHydrationErrorDetails,
      isRecoverableError
    )
  }, [])

  React.useEffect(() => {
    const { handleStaticIndicator } =
      require('../../../dev/hot-reloader/pages/hot-reloader-pages') as typeof import('../../../dev/hot-reloader/pages/hot-reloader-pages')

    Router.events.on('routeChangeComplete', handleStaticIndicator)

    return function () {
      Router.events.off('routeChangeComplete', handleStaticIndicator)
    }
  }, [])
}
