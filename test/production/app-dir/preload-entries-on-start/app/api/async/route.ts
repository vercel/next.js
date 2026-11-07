import { connection } from 'next/server'

const value = await Promise.resolve('async userland')
console.log('preload-test:async-evaluated')

export async function GET() {
  await connection()
  return Response.json({ value })
}
