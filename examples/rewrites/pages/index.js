import styles from '../styles.module.css'
import Link from 'next/link'

const Code = (p) => <code className={styles.inlineCode} {...p} />

const Index = () => (
  <div className={styles.container}>
    <div className={styles.card}>
      <h1>Rewrites with Next.js</h1>
      <hr className={styles.hr} />
      <p>
        Clicking on each of the <Code>Links</Code> below you'll see how{' '}
        <a href="https://nextjs.org/docs/api-reference/next.config.js/rewrites">
          rewrites can be used to perform custom routing
        </a>{' '}
        with Next.js
      </p>
      <nav>
        <Link href="/about" as="/team">
          <a>Visit /team</a>
        </Link>
        <Link href="/about" as="/about-us">
          <a>Visit /about-us</a>
        </Link>
        <Link href="/docs/[slug]" as="/docs/nextjs">
          <a>Visit Next.js docs</a>
        </Link>
        <Link href="/blog/[...slug]" as="/blog/a/b/nextjs">
          <a>Visit Next.js blog</a>
        </Link>
      </nav>
      <hr className={styles.hr} />
    </div>
  </div>
)

export default Index
