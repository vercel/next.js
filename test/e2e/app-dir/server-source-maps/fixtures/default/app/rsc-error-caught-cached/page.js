import { connection } from 'next/server'
import { Row } from './row'

async function throwsInCache() {
  'use cache'
  throw new Error('rsc-error-caught-cached')
}

export default async function Page() {
  await connection()
  return <Row promise={throwsInCache()} />
}
