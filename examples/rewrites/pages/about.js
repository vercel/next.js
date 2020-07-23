import styles from '../styles.module.css'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Code = (p) => <code className={styles.inlineCode} {...p} />

export default function About() {
  const { asPath, route } = useRouter();
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>This is the {asPath} page.</h1>
        <hr className={styles.hr} />
        <p>
          {' '}
          This page was rendered from{' '}
          <Code>{`pages${route}.js`}</Code> file.
        </p>
        <Link href="/">
          <a> &larr; Back home</a>
        </Link>
      </div>
    </div>
  )
}
