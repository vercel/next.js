import { withCookies } from 'utils/middleware/cookies'
import { verifyIdToken } from 'utils/auth/firebaseAdmin'
import createAuthUser, {
  createAuthUserSerializable,
} from 'utils/auth/createAuthUser'

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
    let firebaseUser
    let token
    if (sessionData) {
      ;({ user: firebaseUser, token } = await verifyIdToken(
        sessionData.idToken,
        sessionData.refreshToken
      ))
    }
    const AuthUserSerializable = createAuthUserSerializable(firebaseUser, token)

    // Evaluate the composed getServerSideProps().
    let composedProps = {}
    if (getServerSidePropsFunc) {
      // Add the AuthUser to Next.js context so pages can use
      // it in `getServerSideProps`, if needed.
      const AuthUser = createAuthUser(AuthUserSerializable)
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
