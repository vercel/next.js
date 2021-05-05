import { useState } from 'react'
import styles from '../styles.module.css'

export default function Index() {
  const [response, setResponse] = useState()

  const makeRequest = async () => {
    const res = await fetch('/api/user')

    setResponse({
      status: res.status,
      body: await res.json(),
      limit: res.headers.get('X-RateLimit-Limit'),
      remaining: res.headers.get('X-RateLimit-Remaining'),
    })
  }

  return (
    <main className={styles.container}>
      <h1>Next.js API Routes Rate Limiting</h1>
      <p>
        This example uses <code className={styles.inlineCode}>lru-cache</code>{' '}
        to implement a simple rate limiter for API routes (Serverless
        Functions).
      </p>
      <button onClick={() => makeRequest()}>Make Request</button>
      <code className={styles.code}>
        <div>
          <b>Status Code: </b>
          {response?.status || 'None'}
        </div>
        <div>
          <b>Request Limit: </b>
          {response?.limit || 'None'}
        </div>
        <div>
          <b>Remaining Requests: </b>
          {response?.remaining || 'None'}
        </div>
        <div>
          <b>Body: </b>
          {JSON.stringify(response?.body) || 'None'}
        </div>
      </code>
      <div className={styles.links}>
        <a href="#">View Source</a>
        {' | '}
        <a href="#">Deploy You Own ▲</a>
      </div>
    </main>
  )
}
