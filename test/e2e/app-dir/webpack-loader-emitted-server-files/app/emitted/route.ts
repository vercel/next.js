import { read } from '../../fixtures/app'

export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(read())
}
