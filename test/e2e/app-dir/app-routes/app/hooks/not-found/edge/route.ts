import { notFound } from 'next/navigation'

export async function GET() {
  notFound()
}

export const runtime = 'edge'
