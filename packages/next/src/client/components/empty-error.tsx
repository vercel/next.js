import { globalErrorStyles as styles } from './global-error'

export default function EmptyError() {
  return (
    <html id="__next_error__">
      <head></head>
      <body>
        <div style={styles.error}>
          <div>
            <h2 style={styles.text}>
              Application error: an exception has occurred during building.
            </h2>
          </div>
        </div>
      </body>
    </html>
  )
}
