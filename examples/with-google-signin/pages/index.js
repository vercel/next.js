import React, { useEffect } from 'react'
import Head from 'next/head'
import {
  FirstStrategy,
  SecondStrategy,
  ThirdStrategy,
} from '../components/login'

const Index = () => {
  useEffect(() => {
    try {
      window.gapi.load('auth2', async () => {
        const auth2 = await window.gapi.auth2.init({
          client_id: process.env.google_client_id,
        })
        const signedIn = auth2.isSignedIn.get()
        console.log('Is signed in? ' + signedIn)
      })
    } catch (e) {
      console.error(e)
    }
  })

  return (
    <div>
      <Head>
        <title>Google Sign-In with next.js</title>
      </Head>
      <div style={{ padding: '50px' }}>
        <h1>Google Sign-In</h1>
        <h4>Client-side Sign-In only:</h4>
        <p>
          Use this method if you just need to identify the user on the frontend.
          Use cases for this could be to restrict certain pages to signed-in
          users only or to display basic profile information of a signed-in
          user.{' '}
          <a href="https://developers.google.com/identity/sign-in/web/sign-in">
            Google reference
          </a>
        </p>
        <FirstStrategy />

        <hr style={{ margin: '20px 0', border: '1px solid black' }} />

        <h4>Client-side Sign-In with token verification on the server:</h4>
        <p>
          When a user signs in, the Google OAuth server sends back an{' '}
          <i>id_token</i>, which you pass on to your own server in an HTTPS POST
          request. After decoding the <i>id_token</i> on the server with{' '}
          <a href="https://www.npmjs.com/package/google-auth-library">
            google-auth-library
          </a>
          , you can use the user's basic profile information that were stored in
          the JWT's payload (e.g. email address) and store it in your database.{' '}
          <a href="https://developers.google.com/identity/sign-in/web/backend-auth">
            Google reference
          </a>
        </p>
        <SecondStrategy />

        <hr style={{ margin: '20px 0', border: '1px solid black' }} />

        <h4>
          Client-side Sign-In with offline Google API access on the server:
        </h4>
        <p>
          The final example grants your application 'offline access'. After a
          user signs in, the Google OAuth servers return a one-time code, which
          you can then send to your server. On your server, you can use this
          one-time code to obtain an access and refresh token pair for this
          user, so that you can make requests to Google APIs on the user's
          behalf (based on granted permission scopes), even when the user is not
          currently signed into your application.{' '}
          <a href="https://developers.google.com/identity/sign-in/web/server-side-flow">
            Google reference
          </a>
        </p>
        <ThirdStrategy />
      </div>
    </div>
  )
}

export default Index
