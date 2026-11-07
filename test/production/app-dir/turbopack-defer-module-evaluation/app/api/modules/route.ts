import { connection } from 'next/server'
import { evaluated } from '../../../lib/evaluated'
import { sideEffectFree } from '../../../lib/side-effect-free'
import { withSideEffect } from '../../../lib/with-side-effect'

export async function GET(request: Request) {
  await connection()

  const before = [...evaluated()]
  const use = new URL(request.url).searchParams.has('use')
  const values = [withSideEffect(), use ? sideEffectFree() : null]

  return Response.json({ before, values, after: [...evaluated()] })
}
