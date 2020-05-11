/* eslint react/jsx-props-no-spreading: 0 */

import React from 'react'
import PropTypes from 'prop-types'
import { get, set } from 'lodash/object'
import { AuthUserInfoContext, useFirebaseAuth } from '../auth/hooks'
import { createAuthUser, createAuthUserInfo } from '../auth/user'

// Gets the authenticated user from the Firebase JS SDK, when client-side,
// or from the request object, when server-side. Add the AuthUserInfo to
// context.
export default ComposedComponent => {
  const WithAuthUserComp = props => {
    const { AuthUserInfo, ...otherProps } = props

    // We'll use the authed user from client-side auth (Firebase JS SDK)
    // when available. On the server side, we'll use the authed user from
    // the session. This allows us to server-render while also using Firebase's
    // client-side auth functionality.
    const { user: firebaseUser } = useFirebaseAuth()
    const AuthUserFromClient = createAuthUser(firebaseUser)
    const { AuthUser: AuthUserFromSession, token } = AuthUserInfo
    const AuthUser = AuthUserFromClient || AuthUserFromSession || null

    return (
      <AuthUserInfoContext.Provider value={{ AuthUser, token }}>
        <ComposedComponent {...otherProps} />
      </AuthUserInfoContext.Provider>
    )
  }

  WithAuthUserComp.getInitialProps = async ctx => {
    const { req, res } = ctx

    // Get the AuthUserInfo object.
    let AuthUserInfo
    if (typeof window === 'undefined') {
      // If server-side, get AuthUserInfo from the session in the request.
      // Don't include server middleware in the client JS bundle. See:
      // https://arunoda.me/blog/ssr-and-server-only-modules
      const { addSession } = require('../middleware/cookieSession')
      addSession(req, res)
      AuthUserInfo = createAuthUserInfo({
        firebaseUser: get(req, 'session.decodedToken', null),
        token: get(req, 'session.token', null),
      })
    } else {
      // If client-side, get AuthUserInfo from stored data. We store it
      // in _document.js. See:
      // https://github.com/zeit/next.js/issues/2252#issuecomment-353992669
      try {
        const jsonData = JSON.parse(
          window.document.getElementById('__MY_AUTH_USER_INFO').textContent
        )
        if (jsonData) {
          AuthUserInfo = jsonData
        } else {
          // Use the default (unauthed) user info if there's no data.
          AuthUserInfo = createAuthUserInfo()
        }
      } catch (e) {
        // If there's some error, use the default (unauthed) user info.
        AuthUserInfo = createAuthUserInfo()
      }
    }

    // Explicitly add the user to a custom prop in the getInitialProps
    // context for ease of use in child components.
    set(ctx, 'myCustomData.AuthUserInfo', AuthUserInfo)

    // Evaluate the composed component's getInitialProps().
    let composedInitialProps = {}
    if (ComposedComponent.getInitialProps) {
      composedInitialProps = await ComposedComponent.getInitialProps(ctx)
    }

    return {
      ...composedInitialProps,
      AuthUserInfo,
    }
  }

  WithAuthUserComp.displayName = `WithAuthUser(${ComposedComponent.displayName})`

  WithAuthUserComp.propTypes = {
    AuthUserInfo: PropTypes.shape({
      AuthUser: PropTypes.shape({
        id: PropTypes.string.isRequired,
        email: PropTypes.string.isRequired,
        emailVerified: PropTypes.bool.isRequired,
      }),
      token: PropTypes.string,
    }).isRequired,
  }

  WithAuthUserComp.defaultProps = {}

  return WithAuthUserComp
}
