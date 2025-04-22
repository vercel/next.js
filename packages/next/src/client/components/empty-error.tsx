import { globalErrorStyles as styles } from './global-error'

export default function EmptyError({ err }: { err?: Error }) {
  return (
    <html id="__next_error__">
      <head></head>
      <body>
        {process.env.NODE_ENV !== 'production' && err ? (
          <template
            data-next-error-message={err.message}
            data-next-error-digest={'digest' in err ? err.digest : ''}
            data-next-error-stack={err.stack}
          />
        ) : null}
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
