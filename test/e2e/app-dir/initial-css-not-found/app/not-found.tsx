import styles from './styles.module.css'

/**
 * The mere existence of a not found page importing the same css as a layout used to prevent it frombeing served.
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
