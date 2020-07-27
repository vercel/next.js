export default withAppContainer(
  withAuth(
    class Blog extends React.Component {
      render() {
        const { props, state } = this

        return (
          <Header
            inverse={true}
            user={props.user}
            pathname={props.url.pathname}
            onLogout={() => {
              props.onUser(null)
              props.url.push('/login')
            }}
            onLogoRightClick={() => props.url.push('/logos')}
          />
        )
      }
    }
  )
)
