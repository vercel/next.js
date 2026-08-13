import { connection } from 'next/server'

export default async function Page(): Promise<never> {
  await connection()
  throw new Error('This is an error')
}
