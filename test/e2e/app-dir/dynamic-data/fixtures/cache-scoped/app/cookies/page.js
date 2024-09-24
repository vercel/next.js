import { cookies as nextCookies } from 'next/headers'
import { unstable_cache as cache } from 'next/cache'

const cookies = cache(() => nextCookies())

export default async function Page({ searchParams }) {
  console.log('cookies()', await cookies())
  return (
    <div>
      <section>
        This example uses `cookies()` but is configured with `dynamic = 'error'`
        which should cause the page to fail to build
      </section>
      <section id="cookies">
        <h3>cookies</h3>
        {cookies()
          .getAll()
          .map((cookie) => {
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
    </div>
  )
}
