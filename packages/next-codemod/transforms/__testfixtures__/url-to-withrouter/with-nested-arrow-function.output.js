import { withRouter } from "next/router";

export default withRouter(withAppContainer(withAuth(
  class Blog extends React.Component {
    render() {
      const { props, state } = this

      return (
        (<Header
          inverse={true}
          user={props.user}
          pathname={props.router.pathname}
          onLogout={() => {
            props.onUser(null)
            props.router.push('/login')
          }}
          onLogoRightClick={() => props.router.push('/logos')}
        />)
      );
    }
  }
)));