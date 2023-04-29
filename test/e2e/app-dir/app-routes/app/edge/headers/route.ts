import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getRequestMeta } from '../../../helpers'

export const runtime = 'experimental-edge'

export function GET() {
  const meta = getRequestMeta(headers())
  return NextResponse.json(meta)
}
