import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'

export default function Home({ serverOnlyVariable, message }) {
  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App #2</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <a href="https://nextjs.org">Next.js</a> app #2 on Docker
          Compose!
        </h1>

        <div className={styles.grid}>
          <div className={styles.card}>
            <h3>Public Environment Variables</h3>
            <p>{process.env.NEXT_PUBLIC_ENV_VARIABLE ? `✅` : `❌`}</p>
          </div>

          <div className={styles.card}>
            <h3>Server-Only Environment Variables</h3>
            <p>{serverOnlyVariable ? `✅` : `❌`}</p>
          </div>

          <div className={styles.card}>
            <h3>Docker connection to Next.js app #1</h3>
            <p>{message ? `✅` : `❌`}</p>
          </div>
        </div>

        <p className={styles.description}>
          Get started by editing{' '}
          <code className={styles.code}>next-2/src/pages/index.js</code>
        </p>

        <div className={styles.grid}>
          <a href="https://nextjs.org/docs" className={styles.card}>
            <h3>Documentation &rarr;</h3>
            <p>Find in-depth information about Next.js features and API.</p>
          </a>

          <a href="https://nextjs.org/learn" className={styles.card}>
            <h3>Learn &rarr;</h3>
            <p>Learn about Next.js in an interactive course with quizzes!</p>
          </a>

          <a
            href="https://github.com/vercel/next.js/tree/master/examples"
            className={styles.card}
          >
            <h3>Examples &rarr;</h3>
            <p>Discover and deploy boilerplate example Next.js projects.</p>
          </a>

          <a
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
          >
            <h3>Deploy &rarr;</h3>
            <p>
              Instantly deploy your Next.js site to a public URL with Vercel.
            </p>
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
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer>
    </div>
  )
}

export async function getServerSideProps() {
  const serverOnlyVariable = process.env.ENV_VARIABLE
  const { message } = await fetch(`http://next-1:3000/api/hello`)
    .then((res) => res.json())
    .catch((e) => {
      return { message: false }
    })

  return {
    props: {
      serverOnlyVariable,
      message,
    },
  }
}
