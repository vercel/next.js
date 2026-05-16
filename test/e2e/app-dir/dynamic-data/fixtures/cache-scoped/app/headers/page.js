import { headers as nextHeaders } from 'next/headers'
import { unstable_cache as cache } from 'next/cache'

const headers = cache(() => nextHeaders())

export default async function Page() {
  return (
    <div>
      <section>
        This example uses `headers()` but is configured with `dynamic = 'error'`
        which should cause the page to fail to build
      </section>
      <section id="headers">
        <h3>headers</h3>
        {Array.from(await headers())
          .entries()
          .map(([key, value]) => {
            if (key === 'cookie') return null
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
