import { setTimeout } from 'timers/promises'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'

export async function GET() {
  await connection()
  // See ../api/route.js
  await setTimeout(1100)
  redirect('/')
}
