import { revalidateTag } from './revalidate-tag'
import { NEXT_CACHE_IMPLICIT_TAG_ID } from '../../../lib/constants'

export function revalidatePath(path: string, type?: 'layout' | 'page') {
  path = `${NEXT_CACHE_IMPLICIT_TAG_ID}${path}`

  if (type) {
    path += `${path.endsWith('/') ? '' : '/'}${type}`
  }
  return revalidateTag(path)
}
