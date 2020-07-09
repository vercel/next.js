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
  }
}

export default withAuthComponent
