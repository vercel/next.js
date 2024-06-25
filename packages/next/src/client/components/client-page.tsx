'use client'
import { createDynamicallyTrackedSearchParams } from './search-params'

export function ClientPageRoot({
  Component,
  props,
}: {
  Component: React.ComponentType<any>
  props: { [props: string]: any }
}) {
  // We expect to be passed searchParams but even if we aren't we can construct one from
  // an empty object. We only do this if we are in a static generation as a performance
  // optimization. Ideally we'd unconditionally construct the tracked params but since
  // this creates a proxy which is slow and this would happen even for client navigations
  // that are done entirely dynamically and we know there the dynamic tracking is a noop
  // in this dynamic case we can safely elide it.
  props.searchParams = createDynamicallyTrackedSearchParams(
    props.searchParams || {}
  )
  return <Component {...props} />
}
