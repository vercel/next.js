/* eslint react/jsx-props-no-spreading: 0 */

import React from 'react'
import PropTypes from 'prop-types'

// TODO
// import { AuthUserInfoContext, useFirebaseAuth } from '../auth/hooks'
const createAuthUser = () => {}

// Gets the authenticated user from the Firebase JS SDK, when client-side,
// or from the request object, when server-side. Add the AuthUserInfo to
// context.
const WithAuthUser = (ComposedComponent) => {
  const WithAuthUserComp = (props) => {
    const { AuthUser, ...otherProps } = props
    console.log('AuthUser', AuthUser)

    // TODO
    // We'll use the authed user from client-side auth (Firebase JS SDK)
    // when available. On the server side, we'll use the authed user from
    // the session. This allows us to server-render while also using Firebase's
    // client-side auth functionality.
    //     const { user: firebaseUser } = useFirebaseAuth()
    //     const AuthUserFromClient = createAuthUser(firebaseUser)
    //     const { AuthUser: AuthUserFromSession, token } = AuthUserInfo
    //     const AuthUser = AuthUserFromClient || AuthUserFromSession || null
    //
    //     return (
    //       <AuthUserInfoContext.Provider value={{ AuthUser, token }}>
    //         <ComposedComponent {...otherProps} />
    //       </AuthUserInfoContext.Provider>
    //     )

    return <ComposedComponent {...otherProps} />
  }

  WithAuthUserComp.getInitialProps = async (ctx) => {
    const { req, res } = ctx

    // Get the AuthUser object.
    let AuthUser
    if (req) {
      // If server-side, get AuthUser from the session in the request.
      // Don't include server middleware in the client JS bundle. See:
      // https://arunoda.me/blog/ssr-and-server-only-modules
      const { withCookies } = require('utils/middleware/cookies')
      withCookies(req, res)
      // TODO: validate user token, decode into user data
      const sessionData = req.cookie.get('sessionExampleA')
      console.log('session data', sessionData)
      // const { verifyIdToken } = require('utils/auth/firebaseAdmin')
      // const firebaseUser = await verifyIdToken(sessionData.idToken, sessionData.refreshToken)
      // console.log('firebase user', firebaseUser)
      AuthUser = createAuthUser(sessionData)
    } else {
      // TODO
      // If client-side, get AuthUser from stored data. We store it
      // in _document.js. See:
      // https://github.com/zeit/next.js/issues/2252#issuecomment-353992669
      // try {
      //   const jsonData = JSON.parse(
      //     window.document.getElementById('__MY_AUTH_USER_INFO').textContent
      //   )
      //   if (jsonData) {
      //     AuthUser = jsonData
      //   } else {
      //     // Use the default (unauthed) user info if there's no data.
      //     AuthUser = createAuthUser()
      //   }
      // } catch (e) {
      //   // If there's some error, use the default (unauthed) user info.
      //   AuthUser = createAuthUser()
      // }
    }

    console.log('AuthUser', AuthUser)

    // Evaluate the composed component's getInitialProps().
    let composedInitialProps = {}
    if (ComposedComponent.getInitialProps) {
      composedInitialProps = await ComposedComponent.getInitialProps(ctx)
    }

    return {
      ...composedInitialProps,
      AuthUser,
    }
  }

  WithAuthUserComp.displayName = `WithAuthUser(${ComposedComponent.displayName})`

  WithAuthUserComp.propTypes = {
    AuthUser: PropTypes.shape({
      id: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
      emailVerified: PropTypes.bool.isRequired,
    }),
  }

  WithAuthUserComp.defaultProps = {}

  return WithAuthUserComp
}

export default WithAuthUser
