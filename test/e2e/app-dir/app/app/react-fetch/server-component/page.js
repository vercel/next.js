async function getRandomMemoizedByFetch() {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  return res.text()
}

export default async function Page() {
  const val1 = await getRandomMemoizedByFetch()
  const val2 = await getRandomMemoizedByFetch()
  return (
    <>
      <h1>React Fetch Server Component</h1>
      <p id="value-1">{val1}</p>
      <p id="value-2">{val2}</p>
    </>
  )
}
