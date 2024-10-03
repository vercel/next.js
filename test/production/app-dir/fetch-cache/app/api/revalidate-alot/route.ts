import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  for (let i = 0; i < 130; i++) {
    revalidateTag(`thankyounext-${i}`)
  }
  return NextResponse.json({ done: true })
}
