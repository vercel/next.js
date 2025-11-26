import { connection } from 'next/server'
import { redirect } from 'next/navigation'

export async function GET() {
  await connection()
  redirect('/another')
}
