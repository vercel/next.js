import { headers, cookies } from 'next/headers'

import { PageSentinel } from '../getSentinelValue'

export const dynamic = 'force-static'

export default async function Page({ searchParams }) {
  return (
    <div>
      <PageSentinel />
      <section>
        This example uses headers/cookies/searchParams directly in a Page
        configured with `dynamic = 'force-static'`. This should cause the page
        to always statically render but without exposing dynamic data
      </section>
      <section id="headers">
        <h3>headers</h3>
        {Array.from(headers().entries()).map(([key, value]) => {
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
        {Object.entries(searchParams).map(([key, value]) => {
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
