import { fetchData } from '../../fetch-data'

export default async function Home() {
  const data = await fetchData()
  return <h1>Foo Page {data}</h1>
}
