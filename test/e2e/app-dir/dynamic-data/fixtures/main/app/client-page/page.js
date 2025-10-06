'use client'

import { PageSentinel } from '../getSentinelValue'

export default async function Page({ searchParams }) {
  return (
    <div>
      <PageSentinel />
      <section>
        This example uses headers/cookies/searchParams directly in a Page
        configured with `dynamic = 'force-dynamic'`. This should cause the page
        to always render dynamically regardless of dynamic APIs used
      </section>
      <section id="headers">
        <h3>headers</h3>
        <p>This is a client Page so `headers()` is not available</p>
      </section>
      <section id="cookies">
        <h3>cookies</h3>{' '}
        <p>This is a client Page so `cookies()` is not available</p>
      </section>
      <section id="searchparams">
        <h3>searchParams</h3>
        {Object.entries(await searchParams).map(([key, value]) => {
          return (
            <div key={key}>
              <h4>{key}</h4>
              <pre className={key}>{value}</pre>
            </div>
          )
        })}
      </section>
    </div>
  )
}
