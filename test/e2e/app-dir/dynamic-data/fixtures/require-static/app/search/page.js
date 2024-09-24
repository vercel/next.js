export const dynamic = 'error'

export default async function Page({ searchParams }) {
  return (
    <div>
      <section>
        This example uses `searchParams` but is configured with `dynamic =
        'error'` which should cause the page to fail to build
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
