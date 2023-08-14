import Head from 'next/head'
import React, { useEffect } from 'react'
import styles from '../../styles/Home.module.css'
import dynamic from 'next/dynamic'
import { canHandleRoute, getRoutingComponent } from 'supertokens-auth-react/ui'
import { redirectToAuth } from 'supertokens-auth-react'
import { ThirdPartyEmailPasswordPreBuiltUI } from 'supertokens-auth-react/recipe/thirdpartyemailpassword/prebuiltui'
import { EmailVerificationPreBuiltUI } from 'supertokens-auth-react/recipe/emailverification/prebuiltui'

const SuperTokensComponentNoSSR = dynamic<{}>(
  new Promise((res) =>
    res(() =>
      getRoutingComponent([
        ThirdPartyEmailPasswordPreBuiltUI,
        EmailVerificationPreBuiltUI,
      ])
    )
  ),
  { ssr: false }
)

export default function Auth(): JSX.Element {
  useEffect(() => {
    if (
      canHandleRoute([
        ThirdPartyEmailPasswordPreBuiltUI,
        EmailVerificationPreBuiltUI,
      ]) === false
    ) {
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
