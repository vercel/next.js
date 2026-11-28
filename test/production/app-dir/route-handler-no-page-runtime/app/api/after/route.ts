import { after } from 'next/server'

export function GET() {
  after(() => {})
  return Response.json('hello world')
}
