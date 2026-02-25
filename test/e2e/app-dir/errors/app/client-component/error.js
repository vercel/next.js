'use client'

import styles from './style.module.css'

export default function ErrorBoundary({
  error,
  reset,
  unstable_retry,
  componentStack,
  ownerStack,
}) {
  return (
    <>
      <p id="error-boundary-message">An error occurred: {error.message}</p>
      <p id="error-component-stack">{componentStack}</p>
      <p id="error-owner-stack">{ownerStack}</p>
      <button id="reset" onClick={() => reset()} className={styles.button}>
        Try again
      </button>
      <button
        id="retry"
        onClick={() => unstable_retry()}
        className={styles.button}
      >
        Retry
      </button>
    </>
  )
}
