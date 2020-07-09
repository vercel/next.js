// A higher-order component to handle auth logic for pages.
// It should be paired with `withAuthServerSideProps`.
// See:
// https://github.com/vercel/next.js/discussions/10925#discussioncomment-12471
const withAuthComponent = (ChildComponent) => {
  return (props) => {
    const { AuthUser, ...otherProps } = props
    console.log('AuthUser in withAuthComponent:', AuthUser)

    // TODO: use the client-side authed user from the Firebase
    //   JS SDK when it's loaded.
    // TODO: set the AuthUser context
    return <ChildComponent {...otherProps} />

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
    //     return (
    //       <AuthUserInfoContext.Provider value={{ AuthUser, token }}>
    //         <ComposedComponent {...otherProps} />
    //       </AuthUserInfoContext.Provider>
    //     )
  }
}

export default withAuthComponent
