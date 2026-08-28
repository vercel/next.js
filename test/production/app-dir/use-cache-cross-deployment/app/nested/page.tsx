import { connection } from 'next/server'
import { getDate } from '../logic'

async function getInnerData() {
  'use cache: remote'

  return getDate()
}

async function getOuterData() {
  'use cache: remote'

  return getInnerData()
}

export default async function Page() {
  await connection()

  return <span id="data">{await getOuterData()}</span>
}
