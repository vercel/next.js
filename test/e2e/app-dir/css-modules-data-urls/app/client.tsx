'use client'
// @ts-expect-error
import styles from 'data:text/css+module,.client{font-weight:700}'

export const ClientComponent = () => {
  return (
    <div id="client" className={`${styles.client}`}>
      This text should be bold
    </div>
  )
}
