import { after } from 'next/server'
import { cliLog } from '../../../utils/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const data = { message: 'Hello, world!' }
  after(() => {
    cliLog({ source: '[route handler] /route' })
  })

  return Response.json({ data })
}
