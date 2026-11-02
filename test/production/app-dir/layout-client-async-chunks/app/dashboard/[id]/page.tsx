import { connection } from 'next/server'
import { track } from '../../../lib/analytics'
import Chart from './chart'

export default async function Dashboard() {
  await connection()
  return <Chart onEvent={track} />
}
