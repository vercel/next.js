// Next.js route.js

import { measure } from '../../../lib/measure'

export async function GET() {
  const result = await measure(
    'app route esm',
    () => import('../../../lib/esm.js')
  )

  return Response.json(result)
}
