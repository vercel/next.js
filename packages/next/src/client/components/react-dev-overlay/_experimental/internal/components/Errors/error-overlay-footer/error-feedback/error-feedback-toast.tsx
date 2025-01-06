import { Toast } from '../../../Toast'
import { CloseIcon } from '../../../../icons/CloseIcon'

export function ErrorFeedbackToast({
  isVisible,
  setIsVisible,
}: {
  isVisible: boolean
  setIsVisible: (isVisible: boolean) => void
}) {
  if (!isVisible) {
    return null
  }

  return (
    <Toast role="status" className="error-feedback-toast">
      <div className="error-feedback-toast-text">
        Thanks for your feedback!
        <button
          onClick={() => setIsVisible(false)}
          className="error-feedback-toast-hide-button"
          aria-label="Hide error feedback toast"
        >
          <CloseIcon />
        </button>
      </div>
    </Toast>
  )
}
