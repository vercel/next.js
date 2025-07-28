import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = crypto.randomBytes(8, undefined) as unknown as Buffer
  const second = crypto.randomBytes(8)
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').randomBytes(size)</dt>
        <dd id="first">{first.toString('hex')}</dd>
        <dt>[second] require('node:crypto').randomUUID(size)</dt>
        <dd id="second">{second.toString('hex')}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
