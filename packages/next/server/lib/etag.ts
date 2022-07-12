import { fnv1a } from '../../lib/fnv1a'

export const generateETag = (payload: string | Buffer, weak = false) => {
  const prefix = weak ? 'W/"' : '"'
  return prefix + fnv1a(payload).toString(36) + '"'
}
