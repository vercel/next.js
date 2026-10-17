// We want to trace these fetches in runtime
export const dynamic = 'force-dynamic'

export default async function Page() {
  const origin = `http://localhost:${process.env.TEST_FETCH_STATUS_UPSTREAM_PORT}`
  const statuses = await Promise.all(
    [200, 404, 503].map(async (status) => {
      const res = await fetch(`${origin}/status/${status}`, {
        cache: 'no-store',
      })
      return res.status
    })
  )

  return <p id="statuses">{statuses.join(',')}</p>
}
