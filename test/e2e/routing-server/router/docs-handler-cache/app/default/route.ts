import { randomUUID } from 'node:crypto'

export function GET() {
  return Response.json({ method: 'GET', invocation: randomUUID() })
}
