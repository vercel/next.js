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

  // The "Blocking Route" error message is specifically formatted to look nice
  // in the overlay (rather than just passed through from the console), so we
  // intentionally don't truncate it and rely on the scroll overflow instead.
  const shouldTruncate = isTooTall && errorType !== 'Blocking Route'

  return (
    <div className="nextjs__container_errors_wrapper">
      <div
        ref={messageRef}
        id="nextjs__container_errors_desc"
        className={`nextjs__container_errors_desc ${shouldTruncate && !isExpanded ? 'truncated' : ''}`}
      >
        {errorMessage}
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
    </div>
  )
}

export const styles = `
  .nextjs__container_errors_wrapper {
    position: relative;
  }

  .nextjs__container_errors_desc {
    margin: 0;
    margin-left: 4px;
    color: var(--color-red-900);
    font-weight: 500;
    font-size: var(--size-16);
    letter-spacing: -0.32px;
    line-height: var(--size-24);
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }

  .nextjs__container_errors_desc.truncated {
    max-height: 200px;
    overflow: hidden;
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
    padding: 6px 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: 999px;
    box-shadow:
      0px 2px 2px var(--color-gray-alpha-100),
      0px 8px 8px -8px var(--color-gray-alpha-100);
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
