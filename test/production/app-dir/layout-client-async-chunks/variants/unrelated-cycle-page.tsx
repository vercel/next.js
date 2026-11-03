import { connection } from 'next/server'
import { track } from '../../../lib/analytics'
import Chart from './chart'

export default async function Dashboard() {
  await connection()
  // This async cycle has no importer path back to the root layout.
  void import('../../../lib/unrelated-a')
  return <Chart onEvent={track} />
}
