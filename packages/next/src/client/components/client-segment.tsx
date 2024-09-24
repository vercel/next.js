'use client'

type ClientSegmentRootProps = {
  Component: React.ComponentType
  props: { [props: string]: any }
}

export function ClientSegmentRoot({
  Component,
  props,
}: ClientSegmentRootProps) {
  if (typeof window === 'undefined') {
    const { createDynamicallyTrackedParams } =
      require('../../server/request/fallback-params') as typeof import('../../server/request/fallback-params')

    props.params = props.params
      ? createDynamicallyTrackedParams(props.params)
      : {}
  }
  return <Component {...props} />
}
