export const dynamic = 'force-dynamic'

export default async function Page() {
  // Fetch large JSON data from our test server
  const res = await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}/large-json`,
    { cache: 'no-store' }
  )
  const data = await res.json()

  return (
    <div>
      <h1>Fetch Memory Test</h1>
      <p id="data-length">Data items: {data.items?.length || 0}</p>
    </div>
  )
}
