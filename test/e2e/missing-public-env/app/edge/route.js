import { readEnv, debugMessage } from '../../lib/env'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ...readEnv(), message: debugMessage() })
}
