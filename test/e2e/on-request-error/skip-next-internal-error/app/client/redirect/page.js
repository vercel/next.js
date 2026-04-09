'use client'

import { connection } from 'next/server'
import { redirect } from 'next/navigation'

export default async function Page() {
  await connection()
  redirect('/another')
}
