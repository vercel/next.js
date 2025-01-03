import { Toast } from '../../../Toast'

export function ErrorFeedbackToast() {
  return (
    <Toast role="status" className="error-feedback-toast">
      <div className="error-feedback-toast-text">Thanks for your feedback!</div>
    </Toast>
  )
}
