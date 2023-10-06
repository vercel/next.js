import { DynamicServerError } from '../client/components/hooks-server-context'
import { NotFoundError } from '../client/components/not-found'
import { RedirectError } from '../client/components/redirect'
import { DynamicNoSSRError } from '../shared/lib/lazy-dynamic/no-ssr-error'

type DynamicUsageError =
  | DynamicServerError
  | NotFoundError
  | RedirectError
  | DynamicNoSSRError

export function isDynamicUsageError(err: unknown): err is DynamicUsageError {
  return (
    err instanceof DynamicServerError ||
    err instanceof NotFoundError ||
    err instanceof RedirectError ||
    err instanceof DynamicNoSSRError
  )
}
