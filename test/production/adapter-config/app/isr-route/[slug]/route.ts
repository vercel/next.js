import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export async function GET(req: NextRequest, { params }) {
  console.log(req.url.toString(), await params)

  return NextResponse.json({
    now: Date.now(),
  })
}
