import { after, NextResponse } from 'next/server'
import { cliLog } from '../../../utils/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  after(() => {
    cliLog({ source: '[route handler] /route-error' })
  })
  return NextResponse.next()
}
