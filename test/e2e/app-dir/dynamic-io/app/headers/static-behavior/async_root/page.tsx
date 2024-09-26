import { headers } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <Component />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function Component() {
  const hasHeader = (await headers()).has('x-sentinel')
  if (hasHeader) {
    return (
      <div>
        header{' '}
        <span id="x-sentinel">{(await headers()).get('x-sentinel')}</span>
      </div>
    )
  } else {
    return <div>no header found</div>
  }
}
