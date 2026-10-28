import { chosen } from '@chosen'
import { revision } from '../../../lib/version'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({
    revision,
    environment: process.env.RETENTION_ENV,
    chosen,
  })
}
