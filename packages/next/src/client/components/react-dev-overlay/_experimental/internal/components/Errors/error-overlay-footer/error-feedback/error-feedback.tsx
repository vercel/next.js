import { useState, useCallback } from 'react'
import { ThumbsUp } from '../../../../icons/thumbs/thumbs-up'
import { ThumbsDown } from '../../../../icons/thumbs/thumbs-down'
import { ErrorFeedbackToast } from './error-feedback-toast'

interface ErrorFeedbackProps {
  errorCode: string
}

export function ErrorFeedback({ errorCode }: ErrorFeedbackProps) {
  const [voted, setVoted] = useState<boolean | null>(null)
  const hasVoted = voted !== null

  const handleFeedback = useCallback(
    async (wasHelpful: boolean) => {
      try {
        const response = await fetch(
          `/__nextjs_error_feedback?errorCode=${errorCode}&wasHelpful=${wasHelpful}`
        )

        if (!response.ok) {
          // Handle non-2xx HTTP responses here if needed
          console.error('Failed to record feedback on the server.')
        }

        setVoted(wasHelpful)
      } catch (error) {
        console.error('Failed to record feedback:', error)
      }
    },
    [errorCode]
  )

  return (
    <>
      <div className="error-feedback">
        <p>Was this helpful?</p>
        <button
          aria-label="Mark as helpful"
          onClick={() => handleFeedback(true)}
          disabled={hasVoted}
          className={`feedback-button ${voted === true ? 'voted' : ''}`}
        >
          <ThumbsUp />
        </button>
        <button
          aria-label="Mark as not helpful"
          onClick={() => handleFeedback(false)}
          disabled={hasVoted}
          className={`feedback-button ${voted === false ? 'voted' : ''}`}
        >
          <ThumbsDown />
        </button>
      </div>
      {hasVoted ? <ErrorFeedbackToast key={errorCode} /> : null}
    </>
  )
}
