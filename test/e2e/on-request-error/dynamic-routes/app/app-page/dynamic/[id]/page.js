import { connection } from 'next/server'

export default async function Page() {
  await connection()
  throw new Error('server-dynamic-page-node-error')
}
