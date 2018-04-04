import React from 'react'
import { compose } from 'react-apollo'
import Link from 'next/link'

import withData from '../lib/withData'
import redirect from '../lib/redirect'
import checkLoggedIn from '../lib/checkLoggedIn'

import SigninBox from '../components/SigninBox'

class Signin extends React.Component {
  static async getInitialProps (context, apolloClient) {
    const { loggedInUser } = await checkLoggedIn(context, apolloClient)

    if (loggedInUser.user) {
      // Already signed in? No need to continue.
      // Throw them back to the main page
      redirect(context, '/')
    }

    return {}
  }

  render () {
    return (
      <div>
        {/* SigninBox handles all login logic. */}
        <SigninBox client={this.props.client} />
        <hr />
        New? <Link prefetch href='/create-account'><a>Create account</a></Link>
      </div>
    )
  }
};

export default compose( // TODO: Maybe remove the usage of compose?
  // withData gives us server-side graphql queries before rendering
  withData
)(Signin)
