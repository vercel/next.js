import { unstable_after as after } from 'next/server'
import { cliLog } from '../../../utils/log'

export const dynamic = 'error'

export async function GET() {
  after(() => {
    cliLog({ source: '[route] /static/route' })
  })
  return new Response()
}
