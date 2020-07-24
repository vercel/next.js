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
        <ul className={styles.list}>
          <li>
            <Link href="/about" as="/team">
              <a>Visit /team</a>
            </Link>
          </li>
          <li>
            <Link href="/about" as="/about-us">
              <a>Visit /about-us</a>
            </Link>
          </li>
          <li>
            <Link href="/docs/[slug]" as="/docs/nextjs">
              <a>Visit Next.js docs</a>
            </Link>
          </li>
          <li>
            <Link href="/blog/[...slug]" as="/blog/a/b/nextjs">
              <a>Visit Next.js blog</a>
            </Link>
          </li>
        </ul>
      </nav>
      <hr className={styles.hr} />
    </div>
  </div>
)

export default Index
