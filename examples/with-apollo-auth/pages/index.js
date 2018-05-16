import React from 'react'
import cookie from 'cookie'
import { withApollo } from 'react-apollo'
import redirect from '../lib/redirect'

class Index extends React.Component {
  static async getInitialProps (context, loggedInUser) {
    if (!loggedInUser.user) {
      // If not signed in, send them somewhere more useful
      redirect(context, '/signin')
    }
    return { loggedInUser }
  }

  signout = () => {
    document.cookie = cookie.serialize('token', '', {
      maxAge: -1 // Expire the cookie immediately
    })

    // Force a reload of all the current queries now that the user is
    // logged in, so we don't accidentally leave any state around.
    this.props.client.cache.reset().then(() => {
      // Redirect to a more useful page when signed out
      redirect({}, '/signin')
    })
  }

  render () {
    const { loggedInUser: { user } } = this.props
    return user ? (
      <div>
        Hello {user.name}!<br />
        <button onClick={this.signout}>Sign out</button>
      </div>
    ) : null
  }
}

export default withApollo(Index)
