import { connection } from 'next/server'

console.log('page-preload:health-loaded')

export default async function Health() {
  await connection()
  return <p>healthy page</p>
}
