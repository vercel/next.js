import { headers } from 'next/headers'

export async function GET(): Promise<Response> {
  await headers()
}
