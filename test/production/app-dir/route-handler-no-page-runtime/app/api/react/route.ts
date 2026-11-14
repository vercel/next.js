import { cache } from 'react'

const getValue = cache(() => 'hello world')

export function GET() {
  return Response.json(getValue())
}
