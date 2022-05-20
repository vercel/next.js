import styles from '../styles/Home.module.css'
import { edgeConfig } from '@ory/integrations/next'
import { Configuration, Session, V0alpha2Api } from '@ory/kratos-client'
import { Layout } from '@vercel/examples-ui'
import { Text, Code, Link, Button, List } from '@vercel/examples-ui'
import { AxiosError } from 'axios'
import { useEffect, useState } from 'react'

// Initialize the Ory Kratos SDK which will connect to the
// /api/.ory/ route we created in the previous step.
const kratos = new V0alpha2Api(new Configuration(edgeConfig))

const SignedOut = () => (
  <>
    <Text className="mb-4">
      <a href={'https://www.ory.sh/'}>Ory</a> is a{' '}
      <a href={'https://github.com/ory'}>
        best-in-class open source identity and access ecosystem
      </a>
      . With Ory you can easily add authentication (email/username + password,
      passwordless, 2FA, WebAuthN, social sign in, ...), OAuth2 and OpenID
      Connect, scalable permission management, and zero trust networking to any
      application. With Vercel and Next.js this only takes a few lines of code:
    </Text>
    <Text className="mb-4">
      <pre
        className={`border typescript border-accents-2 rounded-md bg-white overflow-x-auto p-6`}
        dangerouslySetInnerHTML={{
          __html: `// File: pages/api/.ory/[...paths].ts
import { config, createApiHandler } from '@ory/integrations/next-edge'

export { config }
export default createApiHandler({
  fallbackToPlayground: true
})`,
        }}
      />
    </Text>
    <Text className="mb-4">
      Once integrated, try it out!{' '}
      <a href={'/api/.ory/self-service/registration/browser'}>
        Create an example account
      </a>{' '}
      or <a href={'/api/.ory/self-service/login/browser'}>sign in</a>,{' '}
      <a href={'/api/.ory/self-service/recovery/browser'}>
        recover your account
      </a>{' '}
      or{' '}
      <a href={'/api/.ory/self-service/verification/browser'}>
        verify your email address
      </a>
      ! All using open source{' '}
      <a href={'https://github.com/ory/kratos'}>Ory Kratos</a> in minutes with
      just a{' '}
      <a
        href={
          'https://www.ory.sh/login-spa-react-nextjs-authentication-example-api/'
        }
      >
        few lines of code
      </a>
    </Text>
    <Text className="mb-6">
      and Vercel&apos;s Edge Functions. To learn more about the integration,
      check one of the recommended guides:
    </Text>
  </>
)

const Home = () => {
  // Contains the current session or undefined.
  const [session, setSession] = useState<Session>()

  // The URL we can use to log out.
  const [logoutUrl, setLogoutUrl] = useState<string>()

  // The error message or undefined.
  const [error, setError] = useState<any>()

  useEffect(() => {
    // If the session or error have been loaded, do nothing.
    if (session || error) {
      return
    }

    // Try to load the session.
    kratos
      .toSession()
      .then(({ data: session }) => {
        // Session loaded successfully! Let's set it.
        setSession(session)

        // Since we have a session, we can also get the logout URL.
        return kratos
          .createSelfServiceLogoutFlowUrlForBrowsers()
          .then(({ data }) => {
            setLogoutUrl(data.logout_url)
          })
      })
      .catch((err: AxiosError) => {
        // An error occurred while loading the session or fetching
        // the logout URL. Let's show that!
        setError({
          error: err.toString(),
          data: err.response?.data,
        })
      })
  }, [session, error])

  return (
    <main className="mt-4">
      <div className={styles.main}>
        <Text variant="h2" className={'mb-6 ' + styles.title}>
          {session ? (
            <>
              You are signed in using <a href="https://www.ory.sh/">Ory</a>!
            </>
          ) : (
            <>
              Add Auth to <a href={'https://nextjs.org'}>Next.js</a> with{' '}
              <a href="https://www.ory.sh/">Ory</a>!
            </>
          )}
        </Text>

        <div className={styles.description}>
          {session ? (
            <>
              <Text className="mb-4">
                That was easy, you&apos;re signed in! You can now
                <a href={'/api/.ory/self-service/settings/browser'}>
                  update your profile and user settings
                </a>{' '}
                or{' '}
                <a
                  data-testid="logout"
                  href={logoutUrl}
                  aria-disabled={!logoutUrl}
                >
                  sign out
                </a>
                . Your session details are below the recommended reading
                section.
              </Text>
            </>
          ) : (
            <SignedOut />
          )}
        </div>

        <div className={styles.grid + ' mb-4'}>
          <a
            href="https://www.ory.sh/login-spa-react-nextjs-authentication-example-api-open-source/"
            className={styles.card}
          >
            <h2>Learn &rarr;</h2>
            <p>Learn how to add auth* to your Next.js app!</p>
          </a>

          <a
            href="https://www.youtube.com/watch?v=ueEAoTQ-CTo"
            className={styles.card}
          >
            <h2>Video Tutorial &rarr;</h2>
            <p>Watch the video tutorial and add Ory to Next.js.</p>
          </a>

          <a href="https://www.ory.sh/docs" className={styles.card}>
            <h2>Documentation &rarr;</h2>
            <p>
              Find in-depth information about Ory Kratos&apos; features and API.
            </p>
          </a>

          <a href="https://github.com/ory/kratos" className={styles.card}>
            <h2>GitHub &rarr;</h2>
            <p>Check out Ory Kratos on GitHub!</p>
          </a>
        </div>

        {session ? (
          <>
            <Text className="mb-4 full-width align-left">
              Your session is active. The raw data of it is:
            </Text>
            <Text className="mb-4 full-width align-left">
              <pre
                className={`border typescript border-accents-2 rounded-md bg-white overflow-x-auto p-6`}
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify(session, null, 2),
                }}
              />
            </Text>
          </>
        ) : null}
      </div>
    </main>
  )
}

Home.Layout = Layout

export default Home
