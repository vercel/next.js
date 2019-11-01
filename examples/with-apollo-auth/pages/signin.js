import React from 'react'
import Link from 'next/link'
import { withApollo } from '../lib/apollo'
import redirect from '../lib/redirect'
import checkLoggedIn from '../lib/checkLoggedIn'
import SigninBox from '../components/SigninBox'

const SigninPage = () => (
  <>
    {/* SigninBox handles all login logic. */}
    <SigninBox />
    <hr />
    New?{' '}
    <Link href='/create-account'>
      <a>Create account</a>
    </Link>
  </>
)

SigninPage.getInitialProps = async context => {
  const data = await checkLoggedIn(context.apolloClient)

  if (data.me) {
    // If not signed in, send them somewhere more useful
    redirect(context, '/')
  }

  return {}
}

export default withApollo(SigninPage)
