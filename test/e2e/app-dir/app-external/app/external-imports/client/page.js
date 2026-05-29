'use client'

import getType, { named, value, array, obj } from 'non-isomorphic-text'

import add from 'transpile-ts-lib'

// ESM externals has react has a peer dependency
import useSWR from 'swr'

export default function Page() {
  const { data } = useSWR('swr-state', (v) => v, { fallbackData: 'swr-state' })
  return (
    <div id="content">
      <div>{`module type:${getType()}`}</div>
      <div>{`export named:${named}`}</div>
      <div>{`export value:${value}`}</div>
      <div>{`export array:${array.join(',')}`}</div>
      <div>{`export object:{x:${obj.x}}`}</div>
      <div>{`transpilePackages:${add(2, 3)}`}</div>
      <div>{data}</div>
    </div>
  )
}
