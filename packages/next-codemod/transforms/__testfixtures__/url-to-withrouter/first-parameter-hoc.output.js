import { withRouter } from 'next/router'
class Plan extends React.Component {
  render() {
    const { router } = this.props

    return (
      <Page>
        <Header
          user={user}
          pathname={router.pathname}
          onLogout={() => onUser(null)}
          onLogoRightClick={() => Router.push('/logos')}
        />

        <SubMenu
          subscription={subscription}
          teamsAndUser={teamsAndUser}
          teams={teams}
          user={user}
          url={router}
        />
      </Page>
    )
  }
}

export default withRouter(withAppContainer(withAuthRequired(Plan, 'signup')))
