import { withCookies } from 'utils/middleware/cookies'
import { verifyIdToken } from 'utils/auth/firebaseAdmin'
import createAuthUser from 'utils/auth/createAuthUser'

// An auth wrapper for a page's exported getServerSideProps.
// See this discussion on how best to use getServerSideProps
// with a higher-order component pattern:
// https://github.com/vercel/next.js/discussions/10925#discussioncomment-12471
const withAuthServerSideProps = (getServerSidePropsFunc) => {
  return async (ctx) => {
    const { req, res } = ctx

    // Get the user's token from their cookie, verify it (refreshing
    // as needed), and return the AuthUser object in props.
    withCookies(req, res)
    const sessionData = req.cookie.get('sessionExampleA')
    const firebaseUser = await verifyIdToken(
      sessionData.idToken,
      sessionData.refreshToken
    )
    const AuthUser = createAuthUser(firebaseUser)

    // Evaluate the composed getServerSideProps().
    let composedProps = {}
    if (getServerSidePropsFunc) {
      composedProps = await getServerSidePropsFunc(ctx)
    }

    return {
      props: {
        AuthUser,
        ...composedProps,
      },
    }
  }
}

export default withAuthServerSideProps
