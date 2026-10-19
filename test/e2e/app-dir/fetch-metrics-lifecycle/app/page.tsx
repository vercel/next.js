import { fetchAndReport } from '../fetch-and-report'

export default async function Page() {
  await fetchAndReport('build', true)
  return <p>Build fetch metrics</p>
}
