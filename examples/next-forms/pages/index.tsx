import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import styles from '../styles/Home.module.css'

export default function IndexPage() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Next.js forms</title>
        <meta name="description" content="Learn forms with Next.js" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Forms with <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className={styles.description}>
          Get started by looking at{' '}
          <code className={styles.code}>pages/js-form.js</code> and{' '}
          <code className={styles.code}>pages/no-js-form.js</code>
        </p>

        <div className={styles.grid}>
          <Link href="/js-form" className={styles.card}>
            <h2>Form with JavaScript &rarr;</h2>
            <p>Learn to handle forms with JavaScript in Next.js.</p>
          </Link>

          <Link href="/no-js-form" className={styles.card}>
            <h2>Form without JavaScript &rarr;</h2>
            <p>Learn to handle forms without JavaScript in Next.js.</p>
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">
          Built with Next.js | Powered by{' '}
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer>
    </div>
  )
}
