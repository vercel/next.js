import { withRouter } from "next/router";

export default withRouter(withAppContainer(withAuth(
  class BuyDomains extends React.Component {
    render() {
      const { router } = this.props

      return (
        <Page>
          <Header
            user={user}
            pathname={router.pathname}
            onLogout={() => {
              onUser(null)
              router.push('/login')
            }}
            onLogoRightClick={() => router.push('/logos')}
          />
        </Page>
      );
    }
  }
)));