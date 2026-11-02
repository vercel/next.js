import { connection } from 'next/server'
import Chart from './chart'

export default async function Dashboard() {
  await connection()
  return <Chart />
}
