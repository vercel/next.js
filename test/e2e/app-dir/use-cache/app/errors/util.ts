import { headers } from 'next/headers'

export async function currentReferer() {
  return (await headers()).get('referer')
}
