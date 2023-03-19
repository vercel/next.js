import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Stytch, StytchProps } from '@stytch/stytch-react'
import { OAuthProvidersTypes, SDKProductTypes } from '@stytch/stytch-js'
import styles from '../styles/Home.module.css'
import withSession, { ServerSideProps } from '../lib/withSession'
import LoginWithSMS from '../components/LoginWithSMS'
import { LoginMethod } from '../lib/types'
import LoginEntryPoint from '../components/LoginEntryPoint'

// Set the URL base for redirect URLs. The three cases are as follows:
// 1. Running locally via `vercel dev`; VERCEL_URL will contain localhost, but will not be https.
// 2. Deploying via Vercel; VERCEL_URL will be generated on runtime and use https.
// 3. Running locally via `npm run dev`; VERCEL_URL will be undefined and the app will be at localhost.
let REDIRECT_URL_BASE = ''

if (process.env.NEXT_PUBLIC_VERCEL_URL?.includes('localhost')) {
  REDIRECT_URL_BASE = 'http://localhost:3000'
} else if (process.env.NEXT_PUBLIC_VERCEL_URL !== undefined) {
  REDIRECT_URL_BASE = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
} else {
  REDIRECT_URL_BASE = 'http://localhost:3000'
}

const stytchProps: StytchProps = {
  loginOrSignupView: {
    products: [SDKProductTypes.oauth, SDKProductTypes.emailMagicLinks],
    emailMagicLinksOptions: {
      loginRedirectURL: REDIRECT_URL_BASE + '/api/authenticate_magic_link',
      loginExpirationMinutes: 30,
      signupRedirectURL: REDIRECT_URL_BASE + '/api/authenticate_magic_link',
      signupExpirationMinutes: 30,
      createUserAsPending: false,
    },
    oauthOptions: {
      providers: [
        { type: OAuthProvidersTypes.Google },
        { type: OAuthProvidersTypes.Microsoft },
        { type: OAuthProvidersTypes.Apple },
      ],
    },
  },
  style: {
    fontFamily: '"Helvetica New", Helvetica, sans-serif',
    primaryColor: '#0577CA',
    primaryTextColor: '#090909',
    width: '321px',
  },
  publicToken: process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN || '',
  callbacks: {
    onEvent: (data: { eventData: { userId: any; email: any } }) => {
      if (
        data.eventData.userId !== undefined &&
        data.eventData.userId != null
      ) {
        console.log({
          userId: data.eventData.userId,
          email: data.eventData.email,
        })
      } else {
        console.warn('The user is not found. Data: ', data)
      }
    },
    onSuccess: (data) => console.log(data),
    onError: (data) => console.log(data),
  },
}

type Props = {
  publicToken: string
  user: {
    id: string
  }
}

const App = (props: Props) => {
  const { user, publicToken } = props
  const [loginMethod, setLoginMethod] = React.useState<LoginMethod | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/profile')
    }
  })

  const loginMethodMap: Record<LoginMethod, React.ReactElement> = {
    [LoginMethod.API]: <LoginWithSMS />,
    [LoginMethod.SDK]: (
      <div className={styles.container}>
        <Stytch
          publicToken={publicToken || ''}
          loginOrSignupView={stytchProps.loginOrSignupView}
          style={stytchProps.style}
          callbacks={stytchProps.callbacks}
        />
      </div>
    ),
  }

  return (
    <div className={styles.root}>
      {loginMethod === null ? (
        <LoginEntryPoint setLoginMethod={setLoginMethod} />
      ) : (
        loginMethodMap[loginMethod]
      )}
    </div>
  )
}

const getServerSidePropsHandler: ServerSideProps = async ({ req }) => {
  // Get the user's session based on the request
  const user = req.session.get('user') ?? null
  const props: Props = {
    publicToken: stytchProps.publicToken,
    user,
  }
  return { props }
}

export const getServerSideProps = withSession(getServerSidePropsHandler)

export default App
