import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../utils/log'

export async function GET() {
  const data = { message: 'Hello, world!' }
  after(() => {
    persistentLog({ source: '[route handler] /route' })
  })

  return Response.json({ data })
}
