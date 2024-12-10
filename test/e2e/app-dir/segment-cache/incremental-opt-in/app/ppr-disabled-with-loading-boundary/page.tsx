import { connection } from 'next/server'

export default async function PPRDisabledWithLoadingBoundary() {
  await connection()
  return 'Dynamic Content'
}
