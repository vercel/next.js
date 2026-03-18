'use client'

import { connection } from 'next/server'
import { notFound } from 'next/navigation'

export default async function Page() {
  await connection()
  notFound()
}
