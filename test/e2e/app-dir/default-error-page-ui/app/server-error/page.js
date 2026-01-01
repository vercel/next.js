import { connection } from 'next/server'

export default async function ServerErrorPage() {
  await connection()
  throw new Error('Test server error')
}
