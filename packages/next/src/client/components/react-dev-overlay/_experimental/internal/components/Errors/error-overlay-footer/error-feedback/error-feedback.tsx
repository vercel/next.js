import { useState, useCallback } from 'react'
import { ThumbsUp } from '../../../../icons/thumbs/thumbs-up'
import { ThumbsDown } from '../../../../icons/thumbs/thumbs-down'

interface ErrorFeedbackProps {
  errorCode: string
}
export function ErrorFeedback({ errorCode }: ErrorFeedbackProps) {
  const [voted, setVoted] = useState<boolean | null>(null)
  const hasVoted = voted !== null

  const handleFeedback = useCallback(
    async (wasHelpful: boolean) => {
      // Optimistically set feedback state without loading/error states to keep implementation simple
      setVoted(wasHelpful)
      try {
        const response = await fetch(
          `${process.env.__NEXT_ROUTER_BASEPATH || ''}/__nextjs_error_feedback?${new URLSearchParams(
            {
              errorCode,
              wasHelpful: wasHelpful.toString(),
            }
          )}`
        )

        if (!response.ok) {
          // Handle non-2xx HTTP responses here if needed
          console.error('Failed to record feedback on the server.')
        }
      } catch (error) {
        console.error('Failed to record feedback:', error)
      }
    },
    [errorCode]
  )

  return (
    <>
      <div className="error-feedback" role="region" aria-label="Error feedback">
        {hasVoted ? (
          <p className="error-feedback-thanks" role="status" aria-live="polite">
            Thanks for your feedback!
          </p>
        ) : (
          <>
            <p>Was this helpful?</p>
            <button
              aria-label="Mark as helpful"
              onClick={() => handleFeedback(true)}
              className={`feedback-button ${voted === true ? 'voted' : ''}`}
              type="button"
            >
              <ThumbsUp aria-hidden="true" />
            </button>
            <button
              aria-label="Mark as not helpful"
              onClick={() => handleFeedback(false)}
              className={`feedback-button ${voted === false ? 'voted' : ''}`}
              type="button"
            >
              <ThumbsDown aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </>
  )
}
