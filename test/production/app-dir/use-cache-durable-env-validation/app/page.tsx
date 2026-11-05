import { connection } from 'next/server'
import { getValue } from '../cases/rejected'

export default async function Page() {
  // These tests exercise build-time validation, not remote cache execution.
  await connection()
  return <p>{JSON.stringify(await getValue())}</p>
}
