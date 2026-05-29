import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getRequestMeta } from '../../../helpers'

export const runtime = 'edge'

export async function GET() {
  const meta = getRequestMeta(await headers())
  return NextResponse.json(meta)
}
