import { redirect } from 'next/navigation'

export const runtime = 'edge'

export async function GET() {
  redirect('/hooks/json')
}
