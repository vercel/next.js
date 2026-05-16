import { useState, useRef, useLayoutEffect } from 'react'
import type { ErrorType } from '../error-type-label/error-type-label'

export type ErrorMessageType = React.ReactNode

type ErrorMessageProps = {
  errorMessage: ErrorMessageType
  errorType: ErrorType
}

export function ErrorMessage({ errorMessage, errorType }: ErrorMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTooTall, setIsTooTall] = useState(false)
  const messageRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (messageRef.current) {
      setIsTooTall(messageRef.current.scrollHeight > 200)
    }
  }, [errorMessage])

  if (!errorMessage) {
    return null
  }

  // Instant errors are formatted specifically for the overlay rather than
  // passed through from the console, so we don't truncate them — they rely
  // on scroll overflow instead.
  const shouldTruncate = isTooTall && errorType !== 'Instant'

  return (
    <>
      <div className="nextjs__container_errors_wrapper">
        <div
          ref={messageRef}
          id="nextjs__container_errors_desc"
          className={`nextjs__container_errors_desc ${shouldTruncate && !isExpanded ? 'truncated' : ''} ${errorType === 'Instant' ? 'nextjs__container_errors_desc_instant' : ''}`}
        >
          {errorMessage}
        </div>
      </div>
      {shouldTruncate && !isExpanded && (
        <>
          <div className="nextjs__container_errors_gradient_overlay" />
          <button
            onClick={() => setIsExpanded(true)}
            className="nextjs__container_errors_expand_button"
            aria-expanded={isExpanded}
            aria-controls="nextjs__container_errors_desc"
          >
            Show More
          </button>
        </>
      )}
    </>
  )
}

export const styles = `
  .nextjs__container_errors_wrapper {
  }

  .nextjs__container_errors_desc {
    margin: 0;
    color: var(--color-red-900);
    font-weight: 500;
    font-size: var(--size-16);
    letter-spacing: -0.32px;
    line-height: var(--size-24);
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }

  .nextjs__container_errors_desc.nextjs__container_errors_desc_instant {
    color: var(--color-gray-1000);
  }

  .nextjs__container_errors_desc.truncated {
    max-height: 200px;
    overflow: hidden;
  }

  .nextjs__container_errors_desc code {
    font-family: var(--font-stack-monospace);
    font-weight: 500;
    line-height: var(--size-20);
    color: var(--color-gray-1000);
    padding: 2px 6px;
    background: var(--color-background-200);
    border: 1px solid var(--color-gray-200);
    border-radius: var(--rounded-md-2);
  }

  .nextjs__container_errors_gradient_overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 85px;
    background: linear-gradient(
      180deg,
      rgba(250, 250, 250, 0) 0%,
      var(--color-background-100) 100%
    );
  }

  .nextjs__container_errors_expand_button {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--color-background-100);
    border: none;
    border-radius: var(--rounded-full);
    box-shadow:
      0px 2px 2px var(--color-gray-alpha-100),
      0px 8px 8px -8px var(--color-gray-alpha-100),
      0px 0px 0px 1px var(--color-gray-alpha-400);
    font-size: var(--size-13);
    cursor: pointer;
    color: var(--color-gray-900);
    font-weight: 500;
    transition: background-color 0.2s ease;
  }

  .nextjs__container_errors_expand_button:hover {
    background: var(--color-gray-100);
  }
`
