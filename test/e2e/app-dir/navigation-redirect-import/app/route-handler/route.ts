import { redirect } from 'next/navigation'

// Redirect can't be called in a route handler, but it should be able to be imported.
console.log({ redirect })

export function GET() {
  return new Response('hello world')
}
