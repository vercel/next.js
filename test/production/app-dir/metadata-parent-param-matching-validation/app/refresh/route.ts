import { revalidateTag } from 'next/cache'
import { METADATA_TAG } from '../metadata'

export async function POST() {
  revalidateTag(METADATA_TAG, { expire: 0 })
  return new Response('refreshed')
}
