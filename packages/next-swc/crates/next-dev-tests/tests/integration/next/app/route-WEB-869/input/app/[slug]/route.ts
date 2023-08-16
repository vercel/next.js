import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const helloHandler = async (_req: NextRequest): Promise<Response> => {
  return NextResponse.json(process.env)
}

export const GET = helloHandler
