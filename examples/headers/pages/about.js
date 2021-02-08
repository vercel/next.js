import Link from 'next/link'
import styles from '../styles.module.css'

const Code = (p) => <code className={styles.inlineCode} {...p} />

export default function About() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: /about</h1>
        <hr className={styles.hr} />
        <p>
          The response contains a custom header{' '}
          <Code>X-About-Custom-Header</Code> : <Code>about_header_value</Code>.
        </p>
        <p>
          To check the response headers of this page, open the Network tab
          inside your browser inspector.
        </p>

        <Link href="/">
          <a> &larr; Back home</a>
        </Link>
      </div>
    </div>
  )
}
