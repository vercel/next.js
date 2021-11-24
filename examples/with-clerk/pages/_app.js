import '../styles/globals.css'
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import Layout from '../components/Layout'

/**
 * List pages you want to be publicly accessible, or leave empty if
 * every page requires authentication. Use this naming strategy:
 *  "/"              for pages/index.js
 *  "/foo"           for pages/foo/index.js
 *  "/foo/bar"       for pages/foo/bar.js
 *  "/foo/[...bar]"  for pages/foo/[...bar].js
 */
const publicPages = ['/', '/sign-in/[[...index]]', '/sign-up/[[...index]]']

const RedirectToSignIn = () => {
  const router = useRouter()
  useEffect(() => {
    router.push('/sign-in')
  })
  return null
}

const MyApp = ({ Component, pageProps }) => {
  const router = useRouter()
  /**
   * If the current route is listed as public, render it directly.
   * Otherwise, use Clerk to require authentication.
   */
  return (
    <ClerkProvider
      frontendApi={process.env.NEXT_PUBLIC_CLERK_FRONTEND_API}
      scriptUrl={process.env.NEXT_PUBLIC_CLERK_JS}
      navigate={(to) => router.push(to)}
    >
      <Layout>
        {publicPages.includes(router.pathname) ? (
          <Component {...pageProps} />
        ) : (
          <>
            <SignedIn>
              <Component {...pageProps} />
            </SignedIn>
            <SignedOut>
              <RedirectToSignIn />
            </SignedOut>
          </>
        )}
      </Layout>
    </ClerkProvider>
  )
}

export default MyApp
