import { foo } from '../lib/foo'

export function GET() {
  foo()
  return Response.json('Hello World!')
}

export const runtime = 'edge'
