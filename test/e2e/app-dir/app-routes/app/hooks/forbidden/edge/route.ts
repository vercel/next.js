import { forbidden } from 'next/navigation'

export async function GET() {
  forbidden()
}

export const runtime = 'edge'
