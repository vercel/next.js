import styles from './styles.module.css'

/**
 * The mere existence of a not found page importing the same css as a layout used to prevent it from being served.
 *
 * See https://github.com/vercel/next.js/issues/77861 and https://github.com/vercel/next.js/issues/79535
 */
export default function NotFoundPage() {
  return (
    <html lang="en">
      <body className={styles.foo}>
        <main>
          <h1>Page not found</h1>
        </main>
      </body>
    </html>
  )
}
