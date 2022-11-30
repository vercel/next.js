import Head from 'next/head'
import React, { useEffect } from 'react'
import styles from '../../styles/Home.module.css'
import dynamic from 'next/dynamic'
import SuperTokens from 'supertokens-auth-react'
import { redirectToAuth } from 'supertokens-auth-react'

const SuperTokensComponentNoSSR = dynamic(
  new Promise((res) => res(SuperTokens.getRoutingComponent)) as any,
  { ssr: false }
)

export default function Auth(): JSX.Element {
  useEffect(() => {
    if (SuperTokens.canHandleRoute() === false) {
      redirectToAuth({
        redirectBack: false,
      })
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
