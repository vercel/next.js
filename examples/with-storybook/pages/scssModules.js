import { Links } from 'components/Links'
import Head from 'next/head'
import styles from '../styles/ScssModules.module.scss'

export default function ScssModules() {
  return (
    <div>
      <Head>
        <title>SCSS Modules</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Links />
      <main className={styles.main}>
        <span>This is styled using SCSS Modules</span>
      </main>
    </div>
  )
}
