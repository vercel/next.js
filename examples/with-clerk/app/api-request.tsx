"use client"

import { SignedIn, SignedOut } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import styles from '../styles/Home.module.css'

const apiSample = `import { getAuth } from '@clerk/nextjs/server'

export default function handler(req, res) {
  const { sessionId, userId } = getAuth(req);
  if (!sessionId) {
    return res.status(401).json({ id: null });
  }
  return res.status(200).json({ id: userId });
}`

export const APIRequest = () => {
  useEffect(() => {
    // @ts-expect-error added this to check if Prism library is loaded before hydration
    console.log({prism: window.Prism})
    // @ts-expect-error
    if (window.Prism) {
      // @ts-expect-error
      window.Prism.highlightAll()
    }
  })

  const [response, setResponse] = useState(
    '// Click above to run the request'
  )

  const makeRequest = async () => {
    setResponse('// Loading...')

    try {
      const res = await fetch('/api/getAuthenticatedUserId')
      const body = await res.json()
      setResponse(JSON.stringify(body, null, '  '))
    } catch (e) {
      setResponse(
        '// There was an error with the request. Please contact support@clerk.dev'
      )
    }
  }

  return (
    <div className={styles.backend}>
      <h2>API request example</h2>
      <div className={styles.card}>
        <button
          rel="noreferrer"
          className={styles.cardContent}
          onClick={() => makeRequest()}
        >
          <img src="/icons/server.svg" />
          <div>
            <h3>fetch('/api/getAuthenticatedUserId')</h3>
            <p>
              Retrieve the user ID of the signed in user, or null if there is no
              user
            </p>
          </div>
          <div className={styles.arrow}>
            <img src="/icons/download.svg" />
          </div>
        </button>
      </div>
      <h4>
        Response
        <em>
          <SignedIn>
            You are signed in, so the request will return your user ID
          </SignedIn>
          <SignedOut>
            You are signed out, so the request will return null
          </SignedOut>
        </em>
      </h4>
      <pre>
        <code className="language-js">{response}</code>
      </pre>
      <h4>pages/api/getAuthenticatedUserId.js</h4>
      <pre>
        <code className="language-js">{apiSample}</code>
      </pre>
    </div>
  )
}