import { connection } from 'next/server'
import { Thrower } from './Thrower'

export default async function Page() {
  await connection()
  return <Thrower />
}
