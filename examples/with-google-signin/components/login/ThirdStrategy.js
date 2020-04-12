import React from 'react'
import Router from 'next/router'

export const ThirdStrategy = () => {
  const handleLogin = () => {
    window.gapi.load('auth2', async () => {
      const auth2 = window.gapi.auth2.getAuthInstance()
      const authResult = await auth2.grantOfflineAccess({
        scope:
          'profile email https://www.googleapis.com/auth/drive.metadata.readonly',
      })
      const res = await fetch('/api/offline-access', {
        method: 'POST',
        body: authResult.code,
      })
      if (res.status === 200) {
        Router.push('/third-strategy')
      }
    })
  }

  return (
    <div>
      <button onClick={handleLogin}>Custom Google Sign In</button>
      <p>
        <small>
          Make sure to follow Google's{' '}
          <a href="https://developers.google.com/identity/branding-guidelines">
            branding guidelines
          </a>
          .
        </small>
      </p>
    </div>
  )
}
