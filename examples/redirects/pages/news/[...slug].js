import { useRouter } from 'next/router'
import Link from 'next/link'
import styles from '../../styles.module.css'

const Code = (p) => <code className={styles.inlineCode} {...p} />

const News = ({ props }) => {
  const { asPath, route, query } = useRouter()

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {asPath}</h1>
        <hr className={styles.hr} />
        <p>
          This page was rendered by <Code>{`pages${route}.js`}</Code>.
        </p>
        <p>
          The query <Code>slug</Code> for this page is:{' '}
          <Code>{JSON.stringify(query.slug)}</Code>
        </p>
        <Link href="/">
          <a> &larr; Back home</a>
        </Link>
      </div>
    </div>
  )
}

export default News
