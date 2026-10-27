import { randomUUID } from 'node:crypto'

export const dynamic = 'force-static'

function invoke(method: string) {
  return Response.json({ method, invocation: randomUUID() })
}

export function GET() {
  return invoke('GET')
}

export function POST() {
  return invoke('POST')
}

export function PUT() {
  return invoke('PUT')
}

export function PATCH() {
  return invoke('PATCH')
}

export function DELETE() {
  return invoke('DELETE')
}

export function OPTIONS() {
  return invoke('OPTIONS')
}

export function HEAD() {
  return new Response(null, { headers: { 'x-invocation': randomUUID() } })
}
