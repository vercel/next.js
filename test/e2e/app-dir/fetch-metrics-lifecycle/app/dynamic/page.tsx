import { connection } from 'next/server'
import { MetricsPage } from '../../metrics'

export default async function Page() {
  await connection()
  return <MetricsPage id="dynamic" />
}
