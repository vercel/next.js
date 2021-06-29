import Head from 'next/head'
import styles from './layout.module.css'

export default function Layout({ children }) {
  return (
    <>
      <Head>
        <title>Layouts Example</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
      <main className={styles.main}>{children}</main>
    </>
  )
}
