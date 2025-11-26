import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const first = await getFilledSync(1)
  const second = await getFilledSync(2)
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').randomFillSync(buffer)</dt>
        <dd id="first">{first.toString()}</dd>
        <dt>[second] require('node:crypto').randomBytes(buffer)</dt>
        <dd id="second">{second.toString()}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getFilledSync(_nonce: number) {
  'use cache'
  const randomBytes = new Uint8Array(16)
  crypto.randomFillSync(randomBytes, 4, 8)
  return randomBytes
}
