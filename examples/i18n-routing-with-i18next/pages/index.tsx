import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Trans } from 'react-i18next'
import styles from '../styles/Home.module.css'

export default function Home() {
  const { locale } = useRouter()
  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div>
          <Link href="/" locale="de">
            <a
              className={`${styles.language} ${
                locale === 'de' && styles.languageActive
              }`}
            >
              Deutsch
            </a>
          </Link>
          <Link href="/" locale="en">
            <a
              className={`${styles.language} ${
                locale === 'en' && styles.languageActive
              }`}
            >
              English
            </a>
          </Link>
        </div>
        <h1 className={styles.title}>
          <Trans i18nKey="welcomeMessage">
            Welcome to <a href="https://www.vercel.com">Next.js</a>!
          </Trans>
        </h1>

        <p className={styles.description}>
          <Trans i18nKey="welcomeSubtitle">
            Get started by editing{' '}
            <code className={styles.code}>pages/index.js</code>
          </Trans>
        </p>

        <div className={styles.grid}>
          <a href="https://nextjs.org/docs" className={styles.card}>
            <Trans i18nKey="cardDocumentation">
              <h3>Documentation →</h3>
              <p>Find in-depth information about Next.js features and API.</p>
            </Trans>
          </a>

          <a href="https://nextjs.org/learn" className={styles.card}>
            <Trans i18nKey="cardLearning">
              <h3>Learn →</h3>
              <p>Learn about Next.js in an interactive course with quizzes!</p>
            </Trans>
          </a>

          <a
            href="https://github.com/vercel/next.js/tree/master/examples"
            className={styles.card}
          >
            <Trans i18nKey="cardExamples">
              <h3>Examples →</h3>
              <p>Discover and deploy boilerplate example Next.js projects.</p>
            </Trans>
          </a>

          <a
            href="https://vercel.com/import?filter=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
          >
            <Trans i18nKey="cardDeploy">
              <h3>Deploy →</h3>
              <p>
                Instantly deploy your Next.js site to a public URL with Vercel.
              </p>
            </Trans>
          </a>
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel Logo" className={styles.logo} />
        </a>
      </footer>
    </div>
  )
}
