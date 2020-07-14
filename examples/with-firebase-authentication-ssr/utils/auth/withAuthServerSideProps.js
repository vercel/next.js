import { withCookies } from 'utils/middleware/cookies'
import { verifyIdToken } from 'utils/auth/firebaseAdmin'
import createAuthUser, {
  createAuthUserSerializable,
} from 'utils/auth/createAuthUser'
import { AUTH_COOKIE_NAME } from 'utils/constants'

// An auth wrapper for a page's exported getServerSideProps.
// See this discussion on how best to use getServerSideProps
// with a higher-order component pattern:
// https://github.com/vercel/next.js/discussions/10925#discussioncomment-12471
const withAuthServerSideProps = ({ authRequired } = {}) => (
  getServerSidePropsFunc
) => {
  return async (ctx) => {
    const { req, res } = ctx

    // Get the user's token from their cookie, verify it (refreshing
    // as needed), and return the AuthUser object in props.
    withCookies(req, res)
    const sessionData = req.cookie.get(AUTH_COOKIE_NAME)
    let firebaseUser
    let token
    if (sessionData) {
      ;({ user: firebaseUser, token } = await verifyIdToken(
        sessionData.idToken,
        sessionData.refreshToken
      ))
    }
    const AuthUserSerializable = createAuthUserSerializable(firebaseUser, token)
    const AuthUser = createAuthUser(AuthUserSerializable)

    // If auth is required but the user is not authed, don't return
    // any props.
    // Ideally, this should redirect on the server-side. See this
    // RFC on supporting redirects from getServerSideProps:
    // https://github.com/vercel/next.js/discussions/14890
    if (!AuthUser.id && authRequired) {
      console.log(
        'Not fetching props: auth is required but the user is not authed.'
      )
      return { props: {} }
    }

    // Evaluate the composed getServerSideProps().
    let composedProps = {}
    if (getServerSidePropsFunc) {
      // Add the AuthUser to Next.js context so pages can use
      // it in `getServerSideProps`, if needed.
      ctx.AuthUser = AuthUser
      composedProps = await getServerSidePropsFunc(ctx)
    }
    return {
      props: {
        AuthUserSerializable,
        ...composedProps,
      },
    }
  }
}

export default withAuthServerSideProps
