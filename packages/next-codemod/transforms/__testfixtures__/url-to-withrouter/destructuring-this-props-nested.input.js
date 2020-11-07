export default withAppContainer(
  withAuth(
    class BuyDomains extends React.Component {
      render() {
        const { url } = this.props

        return (
          <Page>
            <Header
              user={user}
              pathname={url.pathname}
              onLogout={() => {
                onUser(null)
                url.push('/login')
              }}
              onLogoRightClick={() => url.push('/logos')}
            />
          </Page>
        )
      }
    }
  )
)
