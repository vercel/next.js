import { InvariantError } from '../../shared/lib/invariant-error'

export const MIN_PRERENDERABLE_EXPIRE = 300 // 5 minutes
export const MIN_PREFETCHABLE_STALE = 30 // 30 seconds
export const MIN_SHELL_STALE = 300 // 5 minutes

if (process.env.NODE_ENV !== 'production') {
  if (MIN_PREFETCHABLE_STALE > MIN_SHELL_STALE) {
    throw new InvariantError(
      'MIN_PREFETCHABLE_STALE must not exceed MIN_SHELL_STALE.'
    )
  }
}
