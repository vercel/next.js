import { useState, useCallback } from 'react'
import { ThumbsUp } from '../../../../icons/thumbs/thumbs-up'
import { ThumbsDown } from '../../../../icons/thumbs/thumbs-down'
import { cx } from '../../../../utils/cx'

interface ErrorFeedbackProps {
  errorCode: string
  className?: string
}
export function ErrorFeedback({ errorCode, className }: ErrorFeedbackProps) {
  const [votedMap, setVotedMap] = useState<Record<string, boolean>>({})
  const voted = votedMap[errorCode]
  const hasVoted = voted !== undefined
  const disabled = process.env.__NEXT_TELEMETRY_DISABLED

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
      className={cx('error-feedback', className)}
      role="region"
      aria-label="Error feedback"
    >
      {hasVoted ? (
        <p className="error-feedback-thanks" role="status" aria-live="polite">
          Thanks for your feedback!
        </p>
      ) : (
        <>
          <p>
            <a
              href="https://nextjs.org/telemetry#error-feedback"
              rel="noopener noreferrer"
              target="_blank"
            >
              Was this helpful?
            </a>
          </p>
          <button
            aria-disabled={disabled ? 'true' : undefined}
            aria-label="Mark as helpful"
            onClick={disabled ? undefined : () => handleFeedback(true)}
            className={cx('feedback-button', voted === true && 'voted')}
            title={
              disabled
                ? 'Feedback disabled due to setting NEXT_TELEMETRY_DISABLED'
                : undefined
            }
            type="button"
          >
            <ThumbsUp aria-hidden="true" />
          </button>
          <button
            aria-disabled={disabled ? 'true' : undefined}
            aria-label="Mark as not helpful"
            onClick={disabled ? undefined : () => handleFeedback(false)}
            className={cx('feedback-button', voted === false && 'voted')}
            title={
              disabled
                ? 'Feedback disabled due to setting NEXT_TELEMETRY_DISABLED'
                : undefined
            }
            type="button"
          >
            <ThumbsDown
              aria-hidden="true"
              // Optical alignment
              style={{
                translate: '1px 1px',
              }}
            />
          </button>
        </>
      )}
    </div>
  )
}

export const styles = `
  .error-feedback {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    color: var(--color-gray-900);
  }

  .error-feedback-thanks {
    height: var(--size-24);
    display: flex;
    align-items: center;
    padding-right: 4px; /* To match the 4px inner padding of the thumbs up and down icons */
  }

  .feedback-button {
    background: none;
    border: none;
    border-radius: var(--rounded-md);
    width: var(--size-24);
    height: var(--size-24);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:focus {
      outline: var(--focus-ring);
    }

    &:hover {
      background: var(--color-gray-alpha-100);
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }

  .feedback-button[aria-disabled='true'] {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .feedback-button.voted {
    background: var(--color-gray-alpha-200);
  }

  .thumbs-up-icon,
  .thumbs-down-icon {
    color: var(--color-gray-900);
    width: var(--size-16);
    height: var(--size-16);
  }
`
