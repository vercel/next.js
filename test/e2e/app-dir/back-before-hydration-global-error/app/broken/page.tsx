import { connection } from 'next/server'

export default async function Broken(): Promise<never> {
  await connection()
  throw new Error('broken page')
}
