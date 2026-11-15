import { connection } from 'next/server'
import { probe } from '../probe'

export async function GET() {
  await connection()
  return probe()
}
