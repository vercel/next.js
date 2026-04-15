import { revalidateTag } from 'next/cache'

import { CACHE_TAG } from '../../_lib/cached-value'

export async function POST() {
  revalidateTag(CACHE_TAG, 'max')

  return Response.json({ ok: true })
}
