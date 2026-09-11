import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

// Fully-dynamic (ƒ) escape hatch. Client navigation into this route is the
// regression in https://github.com/vercel/next.js/issues/97898.
export const instant = false

export default async function RedirectBlocking() {
  const h = await headers()
  h.get('cookie')
  redirect('/redirect-result')
}
