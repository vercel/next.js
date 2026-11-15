'use server'

import { headers } from 'next/headers'

export async function readRequestHeaders(): Promise<string> {
  await headers()
  return 'Action complete'
}
