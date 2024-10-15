import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = new Uint8Array(crypto.generatePrimeSync(128))
  const second = new Uint8Array(crypto.generatePrimeSync(128))
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').generatePrimeSync(size)</dt>
        <dd id="first">{first.toString()}</dd>
        <dt>[second] require('node:crypto').generatePrimeSync(size)</dt>
        <dd id="second">{second.toString()}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
