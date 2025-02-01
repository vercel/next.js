import { useState, useCallback } from 'react'
import { ThumbsUp } from '../../../../icons/thumbs/thumbs-up'
import { ThumbsDown } from '../../../../icons/thumbs/thumbs-down'
import { noop as css } from '../../../../helpers/noop-template'

interface ErrorFeedbackProps {
  errorCode: string
  className?: string
}
export function ErrorFeedback({ errorCode, className }: ErrorFeedbackProps) {
  const [votedMap, setVotedMap] = useState<Record<string, boolean>>({})
  const voted = votedMap[errorCode]
  const hasVoted = voted !== undefined

  const handleFeedback = useCallback(
    async (wasHelpful: boolean) => {
      // Optimistically set feedback state without loading/error states to keep implementation simple
      setVotedMap((prev) => ({
        ...prev,
        [errorCode]: wasHelpful,
      }))

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
    <div
      className={`error-feedback${className ? ` ${className}` : ''}`}
      role="region"
      aria-label="Error feedback"
    >
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
  )
}

export const styles = css`
  .error-feedback {
    display: flex;
    gap: var(--size-gap);
    white-space: nowrap;
  }

  .error-feedback-thanks {
    height: 1.5rem; /* 24px */
    display: flex;
    align-items: center;
    padding-right: 4px; /* To match the 4px inner padding of the thumbs up and down icons */
  }

  .feedback-button {
    background: none;
    border: none;
    border-radius: var(--rounded-md);
    padding: var(--size-gap-half);
    width: 1.5rem; /* 24px */
    height: 1.5rem; /* 24px */
    display: flex;
    align-items: center;
    cursor: pointer;

    &:focus {
      outline: none;
    }

    &:hover {
      background: var(--color-gray-alpha-100);
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }

  .feedback-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .feedback-button.voted {
    background: var(--color-gray-alpha-200);
  }

  .thumbs-up-icon,
  .thumbs-down-icon {
    color: var(--color-gray-900);
  }
`
