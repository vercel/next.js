import { cookies } from 'next/headers'
import { cache } from 'react'

const getValue = cache(getValueA)

async function getValueA(arg: string) {
  'use cache: private'

  const cookie = (await cookies()).get('use-cache-private-test')
  return `${arg}-${cookie?.value}`
}

export async function GET() {
  return new Response(await getValue('hoisted'))
}
