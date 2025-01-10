import { headers, cookies } from 'next/headers'
import { connection } from 'next/server'

import { PageSentinel } from '../getSentinelValue'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }) {
  await connection()
  return (
    <div>
      <PageSentinel />
      <section>
        This example uses headers/cookies/connection/searchParams directly in a
        Page configured with `dynamic = 'force-dynamic'`. This should cause the
        page to always render dynamically regardless of dynamic APIs used
      </section>
      <section id="headers">
        <h3>headers</h3>
        {Array.from((await headers()).entries()).map(([key, value]) => {
          if (key === 'cookie') return null
          return (
            <div key={key}>
              <h4>{key}</h4>
              <pre className={key}>{value}</pre>
            </div>
          )
        })}
      </section>
      <section id="cookies">
        <h3>cookies</h3>
        {(await cookies()).getAll().map((cookie) => {
          const key = cookie.name
          let value = cookie.value

          if (key === 'userCache') {
            value = value.slice(0, 10) + '...'
          }
          return (
            <div key={key}>
              <h4>{key}</h4>
              <pre className={key}>{value}</pre>
            </div>
          )
        })}
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
