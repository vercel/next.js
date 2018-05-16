import React from 'react'
import Link from 'next/link'
import redirect from '../lib/redirect'

import SigninBox from '../components/SigninBox'

class Signin extends React.Component {
  static async getInitialProps (context, loggedInUser) {
    if (loggedInUser.user) {
      // If signed in, send them somewhere more useful
      redirect(context, '/')
    }
    return { loggedInUser }
  }

  render () {
    return (
      <div>
        {/* SigninBox handles all login logic. */}
        <SigninBox />
        <hr />
        New?{' '}
        <Link prefetch href='/create-account'>
          <a>Create account</a>
        </Link>
      </div>
    )
  }
}

export default Signin
