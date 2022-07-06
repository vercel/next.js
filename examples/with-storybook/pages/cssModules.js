import { Links } from 'components/Links'
import Head from 'next/head'
import styles from '../styles/CssModules.module.css'

export default function CssModules() {
  return (
    <div>
      <Head>
        <title>CSS Modules</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Links />
      <main className={styles.main}>
        <span>This is styled using CSS Modules</span>
      </main>
    </div>
  )
}
