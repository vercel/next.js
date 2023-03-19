import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import styles from '../styles/Home.module.css'
import { SignedIn, SignedOut } from '@clerk/nextjs'

const ClerkFeatures = () => (
  <Link href="/user" className={styles.cardContent}>
    <img src="/icons/layout.svg" />
    <div>
      <h3>Explore features provided by Clerk</h3>
      <p>
        Interact with the user button, user profile, and more to preview what
        your users will see
      </p>
    </div>
    <div className={styles.arrow}>
      <img src="/icons/arrow-right.svg" />
    </div>
  </Link>
)

const SignupLink = () => (
  <Link href="/sign-up" className={styles.cardContent}>
    <img src="/icons/user-plus.svg" />
    <div>
      <h3>Sign up for an account</h3>
      <p>
        Sign up and sign in to explore all the features provided by Clerk
        out-of-the-box
      </p>
    </div>
    <div className={styles.arrow}>
      <img src="/icons/arrow-right.svg" />
    </div>
  </Link>
)

const apiSample = `import { getAuth } from '@clerk/nextjs/server'

export default function handler(req, res) {
  const { sessionId, userId } = getAuth(req);
  if (!sessionId) {
    return res.status(401).json({ id: null });
  }
  return res.status(200).json({ id: userId });
}`

// Main component using <SignedIn> & <SignedOut>.
//
// The SignedIn and SignedOut components are used to control rendering depending
// on whether or not a visitor is signed in.
//
// https://docs.clerk.dev/frontend/react/signedin-and-signedout
const Main = () => (
  <main className={styles.main}>
    <h1 className={styles.title}>Welcome to your new app</h1>
    <p className={styles.description}>Sign up for an account to get started</p>

    <div className={styles.cards}>
      <div className={styles.card}>
        <SignedIn>
          <ClerkFeatures />
        </SignedIn>
        <SignedOut>
          <SignupLink />
        </SignedOut>
      </div>

      <div className={styles.card}>
        <Link
          href="https://dashboard.clerk.dev"
          target="_blank"
          rel="noreferrer"
          className={styles.cardContent}
        >
          <img src="/icons/settings.svg" />
          <div>
            <h3>Configure settings for your app</h3>
            <p>
              Visit Clerk to manage instances and configure settings for user
              management, theme, and more
            </p>
          </div>
          <div className={styles.arrow}>
            <img src="/icons/arrow-right.svg" />
          </div>
        </Link>
      </div>
    </div>

    <APIRequest />

    <div className={styles.links}>
      <Link
        href="https://docs.clerk.dev"
        target="_blank"
        rel="noreferrer"
        className={styles.link}
      >
        <span className={styles.linkText}>Read Clerk documentation</span>
      </Link>
      <Link
        href="https://nextjs.org/docs"
        target="_blank"
        rel="noreferrer"
        className={styles.link}
      >
        <span className={styles.linkText}>Read NextJS documentation</span>
      </Link>
    </div>
  </main>
)

const APIRequest = () => {
  React.useEffect(() => {
    if (window.Prism) {
      window.Prism.highlightAll()
    }
  })
  const [response, setResponse] = React.useState(
    '// Click above to run the request'
  )
  const makeRequest = async () => {
    setResponse('// Loading...')

    try {
      const res = await fetch('/api/getAuthenticatedUserId')
      const body = await res.json()
      setResponse(JSON.stringify(body, null, '  '))
    } catch (e) {
      setResponse(
        '// There was an error with the request. Please contact support@clerk.dev'
      )
    }
  }
  return (
    <div className={styles.backend}>
      <h2>API request example</h2>
      <div className={styles.card}>
        <button
          target="_blank"
          rel="noreferrer"
          className={styles.cardContent}
          onClick={() => makeRequest()}
        >
          <img src="/icons/server.svg" />
          <div>
            <h3>fetch('/api/getAuthenticatedUserId')</h3>
            <p>
              Retrieve the user ID of the signed in user, or null if there is no
              user
            </p>
          </div>
          <div className={styles.arrow}>
            <img src="/icons/download.svg" />
          </div>
        </button>
      </div>
      <h4>
        Response
        <em>
          <SignedIn>
            You are signed in, so the request will return your user ID
          </SignedIn>
          <SignedOut>
            You are signed out, so the request will return null
          </SignedOut>
        </em>
      </h4>
      <pre>
        <code className="language-js">{response}</code>
      </pre>
      <h4>pages/api/getAuthenticatedUserId.js</h4>
      <pre>
        <code className="language-js">{apiSample}</code>
      </pre>
    </div>
  )
}

// Footer component
const Footer = () => (
  <footer className={styles.footer}>
    Powered by{' '}
    <a href="https://clerk.dev" target="_blank" rel="noopener noreferrer">
      <img src="/clerk.svg" alt="Clerk.dev" className={styles.logo} />
    </a>
    +
    <a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer">
      <img src="/nextjs.svg" alt="Next.js" className={styles.logo} />
    </a>
  </footer>
)

const Home = () => (
  <div className={styles.container}>
    <Head>
      <title>Create Next App</title>
      <link rel="icon" href="/favicon.ico" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      ></meta>
    </Head>
    <Main />
    <Footer />
  </div>
)

export default Home
