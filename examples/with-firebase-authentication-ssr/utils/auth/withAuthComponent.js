import { AuthUserContext } from 'utils/auth/useAuthUser'
import createAuthUser from 'utils/auth/createAuthUser'

// A higher-order component to handle auth logic for pages.
// It should be paired with `withAuthServerSideProps`.
// See:
// https://github.com/vercel/next.js/discussions/10925#discussioncomment-12471
const withAuthComponent = (ChildComponent) => {
  return (props) => {
    const { AuthUserSerializable, ...otherProps } = props
    const AuthUser = createAuthUser(AuthUserSerializable)
    console.log(
      'AuthUserSerializable in withAuthComponent:',
      AuthUserSerializable
    )
    console.log('AuthUser in withAuthComponent:', AuthUser)

    // TODO: hook: useClientSideFirebaseUser, which handles
    // Firebase changes + session setting/unsetting.

    // TODO
    // We'll use the authed user from client-side auth (Firebase JS SDK)
    // when available. On the server side, we'll use the authed user from
    // the session. This allows us to server-render while also using Firebase's
    // client-side auth functionality.
    //     const { user: firebaseUser } = useFirebaseAuth()
    //     const AuthUserFromClient = createAuthUser(firebaseUser)
    //     const { AuthUser: AuthUserFromSession, token } = AuthUserInfo
    //     const AuthUser = AuthUserFromClient || AuthUserFromSession || null
    //

    // TODO: use the client-side authed user from the Firebase
    //   JS SDK when it's loaded.
    return (
      <AuthUserContext.Provider value={AuthUser}>
        <ChildComponent {...otherProps} />
      </AuthUserContext.Provider>
    )
  }
}

export default withAuthComponent
