import { Toast } from '../components/Toast'
import { LightningBolt } from '../icons/LightningBolt'
import { CloseIcon } from '../icons/CloseIcon'
import type { Dispatcher } from '../../app/hot-reloader-client'

export function StaticIndicator({ dispatcher }: { dispatcher?: Dispatcher }) {
  return (
    <Toast className="nextjs-static-indicator-toast-wrapper">
      <LightningBolt />
      <span>
        Statically rendered page.{' '}
        <a
          onClick={(e) => e.stopPropagation()}
          href="https://nextjs.org/docs/app/api-reference/next-config-js/devIndicators"
          target="_blank"
          rel="noreferrer"
        >
          Learn more
        </a>
      </span>
      <button
        onClick={() => {
          dispatcher?.onStaticIndicator(false)
        }}
        className="nextjs-toast-hide-button"
        style={{ marginLeft: 'var(--size-gap)' }}
      >
        <CloseIcon />
      </button>
    </Toast>
  )
}
