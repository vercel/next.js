import initFirebase from 'utils/auth/initFirebase'

initFirebase()

const sessionHandler = async (firebaseUser) => {
  // If the user is authed, call login to set a cookie.
  if (firebaseUser) {
    const userToken = await firebaseUser.getIdToken()
    return fetch('/api/login', {
      method: 'POST',
      headers: {
        Authorization: userToken,
        'X-Gladly-Requested-By': 'tab-web-nextjs',
      },
      credentials: 'include',
    })
  }

  // If the user is not authed, call logout to unset the cookie.
  return fetch('/api/logout', {
    method: 'POST',
    // eslint-disable-next-line no-undef
    headers: {
      // This custom header provides modest CSRF protection. See:
      // https://github.com/gladly-team/tab-web#authentication-approach
      'X-Gladly-Requested-By': 'tab-web-nextjs',
    },
    credentials: 'include',
  })
}

export default sessionHandler
