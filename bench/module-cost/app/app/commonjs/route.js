// Next.js route.js

import { measure } from '../../../lib/measure'

export async function GET() {
  const result = await measure(
    'app route commonjs',
    () => import('../../../lib/commonjs.js')
  )

  return Response.json(result)
}
