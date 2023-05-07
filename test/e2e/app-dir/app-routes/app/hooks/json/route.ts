import { getRequestMeta } from '../../../helpers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const meta = getRequestMeta(request.headers)
  return NextResponse.json(meta)
}
