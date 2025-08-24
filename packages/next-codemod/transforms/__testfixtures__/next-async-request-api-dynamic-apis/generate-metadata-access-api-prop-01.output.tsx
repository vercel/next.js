import { headers } from 'next/headers'

export async function generateMetadata() {
  await headers()
}
