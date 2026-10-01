import { connection } from 'next/server'

export default async function Page(): Promise<never> {
  await connection()
  throw new Error('Thrown while rendering the page')
}
