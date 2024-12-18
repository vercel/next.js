import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { Toast } from '../../Toast'
import { CloseIcon } from '../../../icons/CloseIcon'

type ErrorIndicatorProps = {
  readyErrors: ReadyRuntimeError[]
  fullscreen: () => void
  hide: () => void
  hasStaticIndicator?: boolean
}

export function ErrorIndicator({
  hasStaticIndicator,
  readyErrors,
  fullscreen,
  hide,
}: ErrorIndicatorProps) {
  return (
    <Toast
      data-nextjs-toast
      className={`nextjs-toast-errors-parent${hasStaticIndicator ? ' nextjs-error-with-static' : ''}`}
      onClick={fullscreen}
    >
      <div className="nextjs-toast-errors">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>
          {readyErrors.length} issue{readyErrors.length > 1 ? 's' : ''}
        </span>
        <button
          data-nextjs-toast-errors-hide-button
          className="nextjs-toast-hide-button"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            hide()
          }}
          aria-label="Hide Issues"
        >
          <CloseIcon />
        </button>
      </div>
    </Toast>
  )
}
