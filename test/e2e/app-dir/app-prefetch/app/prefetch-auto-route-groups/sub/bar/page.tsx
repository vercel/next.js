import { fetchData } from '../../fetch-data'

export default async function Integrations() {
  const data = await fetchData()

  return <h1>Bar Page {data}</h1>
}
