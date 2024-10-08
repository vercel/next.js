import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = new Uint8Array(16)
  const second = new Uint8Array(16)
  crypto.randomFillSync(first, 4, 8)
  crypto.randomFillSync(second, 4, 8)
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
