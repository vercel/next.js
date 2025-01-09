import crypto from 'node:crypto'

import { SentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  const first = await getRandomIntBetween(1)
  const second = await getRandomIntBetween(2)
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').randomInt(min, max)</dt>
        <dd id="first">{first}</dd>
        <dt>[second] require('node:crypto').randomInt(min, max)</dt>
        <dd id="second">{second}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getRandomIntBetween(nonce: number) {
  'use cache'
  if (nonce === 2) {
    // We want to exercise the case where the function arguments are length 3
    // but the third arg is still not a callback so it runs sync
    return crypto.randomInt(128, 256, undefined) as undefined as number
  } else {
    return crypto.randomInt(128, 256)
  }
}
