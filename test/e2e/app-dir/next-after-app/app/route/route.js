import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'

// (patched in tests)
// export const runtime = 'REPLACE_ME'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = { message: 'Hello, world!' }
  after(() => {
    cliLog({ source: '[route handler] /route' })
  })

  return Response.json({ data })
}
