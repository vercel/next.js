import crypto from 'node:crypto'

import { SentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = crypto.randomInt(128)
  const second = crypto.randomInt(128)
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').randomInt(max)</dt>
        <dd id="first">{first}</dd>
        <dt>[second] require('node:crypto').randomInt(max)</dt>
        <dd id="second">{second}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
