'use client'

import styles from './style.module.css'

export default function ErrorBoundary({ error, reset }) {
  return (
    <>
      <p id="error-boundary-message">An error occurred: {error.message}</p>
      <button id="reset" onClick={() => reset()} className={styles.button}>
        Try again
      </button>
    </>
  )
}
