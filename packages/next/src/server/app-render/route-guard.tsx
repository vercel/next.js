import type { Params } from '../../shared/lib/router/utils/route-matcher'

export type Guard = ({ params }: { params: Params }) => Promise<void> | void

export async function RouteGuard({
  params,
  guards,
}: {
  params: Params
  guards: Guard[]
}) {
  for (const guard of guards) {
    await guard({ params: params })
  }
  return null
}
