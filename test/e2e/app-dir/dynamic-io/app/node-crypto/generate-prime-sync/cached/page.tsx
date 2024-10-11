import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const first = await getGeneratedPrime(1)
  const second = await getGeneratedPrime(2)
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

async function getGeneratedPrime(_nonce: number) {
  'use cache'
  return new Uint8Array(crypto.generatePrimeSync(128))
}
