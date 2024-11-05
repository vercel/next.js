import * as React from 'react'
import { Toast } from '../components/Toast'
import { LightningBolt } from '../icons/LightningBolt'
import { CloseIcon } from '../icons/CloseIcon'
import type { Dispatcher } from '../../app/hot-reloader-client'

export function StaticIndicator({ dispatcher }: { dispatcher?: Dispatcher }) {
  return (
    <Toast role="status" className={`nextjs-static-indicator-toast-wrapper`}>
      <div className="nextjs-static-indicator-toast-icon">
        <LightningBolt />
      </div>
      <div className="nextjs-static-indicator-toast-text">
        Static route
        <button
          onClick={() => {
            // When dismissed, we hide the indicator for 1 hour. Store the
            // timestamp for when to show it again.
            const oneHourAway = Date.now() + 1 * 60 * 60 * 1000

            localStorage?.setItem(
              '__NEXT_DISMISS_PRERENDER_INDICATOR',
              oneHourAway.toString()
            )

            dispatcher?.onStaticIndicator(false)
          }}
          className="nextjs-toast-hide-button"
          aria-label="Hide static indicator"
        >
          <CloseIcon />
        </button>
      </div>
    </Toast>
  )
}
