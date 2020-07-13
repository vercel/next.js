import { AuthUserContext } from 'utils/auth/useAuthUser'
import createAuthUser from 'utils/auth/createAuthUser'
import useFirebaseUser from 'utils/auth/useFirebaseUser'
import useFirebaseCookieManager from 'utils/auth/useFirebaseCookieManager'

// A higher-order component to provide pages with the
// authenticated user.
// This should be paired with `withAuthServerSideProps`.
const withAuthComponent = (ChildComponent) => {
  return (props) => {
    const { AuthUserSerializable, ...otherProps } = props
    const AuthUserFromServer = createAuthUser(AuthUserSerializable)

    // Manages the auth cookie.
    useFirebaseCookieManager()

    const {
      user: firebaseUser,
      initialized: firebaseInitialized,
    } = useFirebaseUser()
    const AuthUserFromClient = createAuthUser(firebaseUser)

    // Set the AuthUser to values from the Firebase JS SDK user
    // once it has initialized. On the server side and before the
    // client-side SDK has initialized, use the AuthUser from the
    // session.
    const AuthUser = firebaseInitialized
      ? AuthUserFromClient
      : AuthUserFromServer
    return (
      <AuthUserContext.Provider value={AuthUser}>
        <ChildComponent {...otherProps} />
      </AuthUserContext.Provider>
    )
  }
}

export default withAuthComponent
