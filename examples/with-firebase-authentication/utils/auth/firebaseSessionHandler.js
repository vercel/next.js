// From:
// https://github.com/zeit/next.js/blob/canary/examples/with-firebase-authentication/pages/index.js

import fetch from 'isomorphic-unfetch'

export const setSession = user => {
  // Log in.
  if (user) {
    return user.getIdToken().then(token => {
      return fetch('/api/login', {
        method: 'POST',
        // eslint-disable-next-line no-undef
        headers: new Headers({ 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify({ token }),
      })
    })
  }

  // Log out.
  return fetch('/api/logout', {
    method: 'POST',
    credentials: 'same-origin',
  })
}
