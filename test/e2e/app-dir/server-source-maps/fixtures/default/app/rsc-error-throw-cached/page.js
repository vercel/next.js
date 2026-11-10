import { connection } from 'next/server'

async function throwsInCache() {
  'use cache'
  throw new Error('rsc-error-throw-cached')
}

export default async function Page() {
  await connection()
  await throwsInCache()
  return null
}
