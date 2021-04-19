import Head from 'next/head'
import React, { useEffect } from 'react'
import styles from '../../styles/Home.module.css'
import dynamic from 'next/dynamic'
import SuperTokens from 'supertokens-auth-react'

const SuperTokensComponentNoSSR = dynamic(
  () =>
    Promise.resolve().then(() => {
      return () => SuperTokens.getRoutingComponent() || null
    }),
  {
    ssr: false,
  }
)

export default function Auth() {
  useEffect(() => {
    if (SuperTokens.canHandleRoute() === false) {
      window.location.href = '/'
    }
  }, [])

  return (
    <div className={styles.container}>
      <Head>
        <title>SuperTokens 💫</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <SuperTokensComponentNoSSR />
      </main>
    </div>
  )
}
