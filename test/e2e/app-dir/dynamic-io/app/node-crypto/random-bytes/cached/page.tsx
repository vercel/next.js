import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const first = await getRandomBytes(1)
  const second = await getRandomBytes(2)
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').randomBytes(size)</dt>
        <dd id="first">{first.toString()}</dd>
        <dt>[second] require('node:crypto').randomBytes(size)</dt>
        <dd id="second">{second.toString()}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getRandomBytes(nonce: number) {
  'use cache'
  if (nonce === 2) {
    return crypto.randomBytes(8, undefined) as unknown as Buffer
  } else {
    return crypto.randomBytes(8)
  }
}
