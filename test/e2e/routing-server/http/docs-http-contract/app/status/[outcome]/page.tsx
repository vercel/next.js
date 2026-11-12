import { connection } from 'next/server'
import { outcome } from '../../../lib/outcome'

export default async function Page({
  params,
}: {
  params: Promise<{ outcome: string }>
}) {
  await connection()
  return outcome((await params).outcome)
}
