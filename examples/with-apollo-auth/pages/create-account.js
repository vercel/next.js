import React from 'react'
import Link from 'next/link'
import { withApollo } from '../lib/apollo'
import redirect from '../lib/redirect'
import checkLoggedIn from '../lib/checkLoggedIn'

import RegisterBox from '../components/RegisterBox'

class CreateAccountPage extends React.Component {
  static async getInitialProps (context) {
    const { loggedInUser } = await checkLoggedIn(context.apolloClient)

    if (loggedInUser.user) {
      // Already signed in? No need to continue.
      // Throw them back to the main page
      redirect(context, '/')
    }

    return {}
  }

  render () {
    return (
      <>
        {/* RegisterBox handles all register logic. */}
        <RegisterBox />
        <hr />
        Already have an account?{' '}
        <Link href='/signin'>
          <a>Sign in</a>
        </Link>
      </>
    )
  }
}

export default withApollo(CreateAccountPage)
