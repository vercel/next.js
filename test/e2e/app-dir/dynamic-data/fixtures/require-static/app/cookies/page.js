import { cookies } from 'next/headers'

export const dynamic = 'error'

export default async function Page(props) {
  return (
    <div>
      <section>
        This example uses `cookies()` but is configured with `dynamic = 'error'`
        which should cause the page to fail to build
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
    </div>
  )
}
