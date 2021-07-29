import { useRouter } from 'next/router'
import Link from 'next/link'
import styles from '../../styles.module.css'

const Code = (p) => <code className={styles.inlineCode} {...p} />

const News = ({ props }) => {
  const { asPath } = useRouter()

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {asPath}</h1>
        <hr className={styles.hr} />
        <p>
          The response contains a custom header{' '}
          <Code>X-News-Custom-Header</Code> : <Code>news_header_value</Code>.
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

export default News
