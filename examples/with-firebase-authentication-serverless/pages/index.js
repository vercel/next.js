import React from 'react'
import PropTypes from 'prop-types'
import { get } from 'lodash/object'
import Link from 'next/link'
import Router from 'next/router'
import withAuthUserInfo from '../utils/pageWrappers/withAuthUserInfo'
import logout from '../utils/auth/logout'

const Index = props => {
  const { AuthUserInfo, data } = props
  const AuthUser = get(AuthUserInfo, 'AuthUser', null)
  const { favoriteFood } = data

  return (
    <div>
      <p>Hi there!</p>
      {!AuthUser ? (
        <p>
          You are not signed in.{' '}
          <Link href={'/auth'}>
            <a>Sign in</a>
          </Link>
        </p>
      ) : (
        <div>
          <p>You're signed in. Email: {AuthUser.email}</p>
          <p
            style={{
              display: 'inlinelock',
              color: 'blue',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
            onClick={async () => {
              try {
                await logout()
                Router.push('/auth')
              } catch (e) {
                console.error(e)
              }
            }}
          >
            Log out
          </p>
        </div>
      )}
      <div>
        <Link href={'/example'}>
          <a>Another example page</a>
        </Link>
      </div>
      <div>
        <div>Your favorite food is {favoriteFood}.</div>
      </div>
    </div>
  )
}

// Just an example.
const mockFetchData = async userId => ({
  user: {
    ...(userId && {
      id: userId,
    }),
  },
  favoriteFood: 'pizza',
})

Index.getInitialProps = async ctx => {
  // Get the AuthUserInfo object. This is set in _app.js.
  // The AuthUserInfo object is available on both the server and client.
  const AuthUserInfo = get(ctx, 'myCustomData.AuthUserInfo', null)
  const AuthUserFromSession = get(AuthUserInfo, 'AuthUser', null)

  // You can also get the token (e.g., to authorize a request when fetching data)
  // const AuthUserToken = get(AuthUserInfo, 'token', null)

  // You can fetch data here.
  const data = await mockFetchData(get(AuthUserFromSession, 'id'))

  return {
    data,
  }
}

Index.displayName = 'Index'

Index.propTypes = {
  AuthUserInfo: PropTypes.shape({
    AuthUser: PropTypes.shape({
      id: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
      emailVerified: PropTypes.bool.isRequired,
    }),
    token: PropTypes.string,
  }),
  data: PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.string,
    }).isRequired,
    favoriteFood: PropTypes.string.isRequired,
  }).isRequired,
}

Index.defaultProps = {
  AuthUserInfo: null,
}

export default withAuthUserInfo(Index)
