import { get, has } from 'lodash/object'
import { withCookies } from 'utils/middleware/cookies'
import { verifyIdToken } from 'utils/auth/firebaseAdmin'

// TODO: move to own file
const createAuthUser = (firebaseUser) => {
  return {
    id: get(firebaseUser, 'uid', null),
    email: get(firebaseUser, 'email', null),
    emailVerified: has(firebaseUser, 'emailVerified')
      ? get(firebaseUser, 'emailVerified', null) // Firebase JS SDK
      : get(firebaseUser, 'email_verified', null), // Firebase admin SDK
  }
}

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
