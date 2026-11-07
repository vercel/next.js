import { NextRequest } from 'next/server'
import { respond } from '../../respond'

export const dynamic = 'error'

export function POST(request: NextRequest) {
  return respond(request, new Request(request))
}

export function PUT(request: NextRequest) {
  return respond(request, new NextRequest(request))
}
