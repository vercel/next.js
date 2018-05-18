import React from 'react'
import Link from 'next/link'
import redirect from '../lib/redirect'
import RegisterBox from '../components/RegisterBox'

class CreateAccount extends React.Component {
  static async getInitialProps (context, loggedInUser) {
    if (loggedInUser.user) {
      // If signed in, can't register, redirect to Index
      redirect(context, '/')
    }
    return { loggedInUser }
  }

  render () {
    return (
      <div>
        <RegisterBox />
        <hr />
        Already have an account?{' '}
        <Link prefetch href='/signin'>
          <a>Sign in</a>
        </Link>
      </div>
    )
  }
}

export default CreateAccount
