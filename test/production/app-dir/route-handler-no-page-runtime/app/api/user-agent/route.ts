import { userAgent } from 'next/server'

export function GET(request: Request) {
  return Response.json(userAgent(request).ua)
}
