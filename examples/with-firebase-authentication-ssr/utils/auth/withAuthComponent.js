import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { AuthUserContext } from 'utils/auth/useAuthUser'
import createAuthUser from 'utils/auth/createAuthUser'
import useFirebaseUser from 'utils/auth/useFirebaseUser'
import useFirebaseCookieManager from 'utils/auth/useFirebaseCookieManager'

// A higher-order component to provide pages with the
// authenticated user. This must be used if using `useAuthUser`.
// To access the user during SSR, this should be paired with
// `withAuthServerSideProps`.
const withAuthComponent = ({
  authRequired = false,
  redirectIfAuthed = false,
} = {}) => (ChildComponent) => {
  return (props) => {
    const { AuthUserSerializable, ...otherProps } = props
    const AuthUserFromServer = createAuthUser(AuthUserSerializable)

    // Manages the auth cookie.
    useFirebaseCookieManager()

    const {
      user: firebaseUser,
      initialized: firebaseInitialized,
    } = useFirebaseUser()
    const AuthUserFromClient = createAuthUser(firebaseUser, firebaseInitialized)

    // Set the AuthUser to values from the Firebase JS SDK user
    // once it has initialized. On the server side and before the
    // client-side SDK has initialized, use the AuthUser from the
    // session.
    const AuthUser = firebaseInitialized
      ? AuthUserFromClient
      : AuthUserFromServer

    // If auth is required but the user is not authed, redirect to
    // the login page.
    const redirectToLogin =
      AuthUser.clientInitialized && !AuthUser.id && authRequired
    const router = useRouter()
    useEffect(() => {
      // Only redirect on the client side.
      if (typeof window === undefined) {
        return
      }
      if (redirectToLogin) {
        console.log(
          'Auth is required but the user is not authed. Redirecting to login.'
        )
        router.push('/auth')
      }
    }, [redirectToLogin, router])

    // If the user is authed and redirectIfAuthed is true, redirect
    // to the app. This is useful for login pages.
    const redirectToApp =
      AuthUser.clientInitialized && AuthUser.id && redirectIfAuthed
    useEffect(() => {
      // Only redirect on the client side.
      if (typeof window === undefined) {
        return
      }
      if (redirectToApp) {
        router.push('/')
      }
    }, [redirectToApp, router])

    // Show a loading screen if we are waiting for the auth client
    // to load (to verify auth status) or are redirecting.
    // This prevents a flash of content on the login screen.
    const showLoader = !!(
      redirectIfAuthed &&
      (!AuthUser.clientInitialized || // waiting on auth client
        (AuthUser.clientInitialized && AuthUser.id)) // redirecting to app
    )
    if (showLoader) {
      return <div>Loading...</div>
    }

    // Render children if one of these is true:
    // - the user is authed
    // - the user is not authed but auth is not required
    const renderChildComponent = !!(
      AuthUser.id ||
      (!AuthUser.id && !authRequired)
    )
    if (!renderChildComponent) {
      return null
    }

    return (
      <AuthUserContext.Provider value={AuthUser}>
        <ChildComponent {...otherProps} />
      </AuthUserContext.Provider>
    )
  }
}

export default withAuthComponent
