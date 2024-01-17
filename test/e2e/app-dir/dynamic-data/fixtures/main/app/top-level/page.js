import { headers, cookies } from 'next/headers'

export default async function Page({ searchParams }) {
  const { __TEST_SENTINEL } = process.env
  return (
    <div>
      <div id="page">{__TEST_SENTINEL}</div>
      <section>
        This example uses headers/cookies/searchParams directly. In static
        generation we'd expect this to bail out to dynamic. In PPR we expect
        this to partially render the root layout only
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
