class AddonsPage extends React.Component {
  render() {
    const { url } = this.props
    return (
      <Page>
        <Header
          user={user}
          pathname={url.pathname}
          onLogout={() => onUser(null)}
          onLogoRightClick={() => Router.push('/logos')}
        />
        <SubMenu
          subscription={subscription}
          teamsAndUser={teamsAndUser}
          teams={teams}
          user={user}
          url={url}
        />
      </Page>
    )
  }
}

export default withAppContainer(withAuthRequired(withError(AddonsPage)))
