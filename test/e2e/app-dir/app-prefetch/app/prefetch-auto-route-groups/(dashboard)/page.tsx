import { fetchCount, fetchData } from '../fetch-data'

export default async function Home() {
  const data = await fetchData()
  return (
    <h1>
      Dashboard {data}
      <div>
        Fetch Count: <span id="count">{fetchCount}</span>
      </div>
    </h1>
  )
}
