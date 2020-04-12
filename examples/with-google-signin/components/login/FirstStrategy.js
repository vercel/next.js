import React, { useEffect } from 'react'
import Router from 'next/router'

export const FirstStrategy = () => {
  const GOOGLE_BUTTON_ID = 'google-sign-in-button'

  useEffect(() => {
    try {
      window.gapi.load('auth2', async () => {
        window.gapi.signin2.render(GOOGLE_BUTTON_ID, {
          theme: 'dark',
          longtitle: true,
          onsuccess: onSuccess,
        })
      })
    } catch (e) {
      console.error(e)
    }
  })

  const onSuccess = googleUser => {
    // Do not ever send user information via the network to your backend!
    // Use an ID token instead (see useSignInStatus and pages/second-strategy.js).
    const profile = googleUser.getBasicProfile()
    console.log('Signing in ' + profile.getName() + '...')
    Router.push('/first-strategy')
  }

  return <div id={GOOGLE_BUTTON_ID} style={{ marginBottom: '20px' }} />
}
