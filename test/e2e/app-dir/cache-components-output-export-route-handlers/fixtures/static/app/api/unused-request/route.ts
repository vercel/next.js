import { headers } from 'next/headers'

export function GET() {
  headers()
  return Response.json({ message: 'Unused request promise' })
}
