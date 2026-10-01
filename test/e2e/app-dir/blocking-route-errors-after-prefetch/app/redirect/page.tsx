import { redirect } from 'next/navigation'
import { connection } from 'next/server'

export default async function Page(): Promise<never> {
  await connection()
  redirect('/destination')
}
