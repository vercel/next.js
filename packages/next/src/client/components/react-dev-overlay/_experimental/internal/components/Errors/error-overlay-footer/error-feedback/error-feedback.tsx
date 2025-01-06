import { useState } from 'react'

import { ThumbsUp } from '../../../../icons/thumbs/thumbs-up'
import { ThumbsDown } from '../../../../icons/thumbs/thumbs-down'
import { ErrorFeedbackToast } from './error-feedback-toast'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ErrorFeedback({ errorCode }: { errorCode: string }) {
  const [voted, setVoted] = useState<'good' | 'bad' | null>(null)
  const [isToastVisible, setIsToastVisible] = useState(false)
  const hasVoted = voted !== null

  // TODO: make API call to /__nextjs_error_feedback
  const handleFeedback = (value: 'good' | 'bad') => {
    setVoted(value)
    setIsToastVisible(true)
  }

  return (
    <>
      <div className="error-feedback">
        <p>Was this helpful?</p>
        <button
          onClick={() => handleFeedback('good')}
          disabled={hasVoted}
          className={`feedback-button ${voted === 'good' ? 'voted' : ''}`}
        >
          <ThumbsUp />
        </button>
        <button
          onClick={() => handleFeedback('bad')}
          disabled={hasVoted}
          className={`feedback-button ${voted === 'bad' ? 'voted' : ''}`}
        >
          <ThumbsDown />
        </button>
      </div>
      <ErrorFeedbackToast
        isVisible={isToastVisible}
        setIsVisible={setIsToastVisible}
      />
    </>
  )
}
