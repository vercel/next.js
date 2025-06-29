import { useCallback, useState } from 'react'

import { ThumbsDown } from '../../../icons/thumbs/thumbs-down'
import { ThumbsUp } from '../../../icons/thumbs/thumbs-up'
import { cx } from '../../../utils/cx'
import { css } from '../../../utils/css'

export function IssueFeedbackButton({ errorCode }: { errorCode: string }) {
  const [votedMap, setVotedMap] = useState<Record<string, boolean>>({})
  const voted = votedMap[errorCode]
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
    <div data-nextjs-issue-feedback-button-group>
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
      <div data-nextjs-issue-feedback-separator />
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
    </div>
  )
}

export const ISSUE_FEEDBACK_BUTTON_STYLES = css`
  [data-nextjs-issue-feedback-button-group] {
    display: flex;
    align-items: center;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-full);
    background: var(--color-background-100);
    box-shadow: var(--shadow-small);
  }

  [data-nextjs-issue-feedback-button-group] button {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  [data-nextjs-issue-feedback-button-group] button:first-child {
    padding: 4px 3px 4px 5px;
    border-radius: var(--rounded-full) 0 0 var(--rounded-full);
  }

  [data-nextjs-issue-feedback-button-group] button:last-child {
    padding: 4px 5px 4px 3px;
    border-radius: 0 var(--rounded-full) var(--rounded-full) 0;
  }

  [data-nextjs-issue-feedback-separator] {
    width: 1px;
    height: 100%;
    background: var(--color-gray-400);
  }
`
