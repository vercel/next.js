import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET(req) {
  return NextResponse.json({
    deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  })
}
