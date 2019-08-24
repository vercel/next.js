import React from 'react'
import cookie from 'cookie'
import { useApolloClient } from '@apollo/react-hooks'

import redirect from '../lib/redirect'
import checkLoggedIn from '../lib/checkLoggedIn'

const Index = ({ loggedInUser }) => {
  const apolloClient = useApolloClient()

  const signout = () => {
    document.cookie = cookie.serialize('token', '', {
      maxAge: -1 // Expire the cookie immediately
    })

    // Force a reload of all the current queries now that the user is
    // logged in, so we don't accidentally leave any state around.
    apolloClient.cache.reset().then(() => {
      // Redirect to a more useful page when signed out
      redirect({}, '/signin')
    })
  }

  return (
    <div>
      Hello {loggedInUser.user.name}!<br />
      <button onClick={signout}>Sign out</button>
    </div>
  )
}

Index.getInitialProps = async context => {
  const { loggedInUser } = await checkLoggedIn(context.apolloClient)

  if (!loggedInUser.user) {
    // If not signed in, send them somewhere more useful
    redirect(context, '/signin')
  }

  return { loggedInUser }
}

export default Index
