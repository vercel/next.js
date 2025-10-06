import crypto from 'node:crypto'

import { SentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  const first = await getRandomIntUpTo(1)
  const second = await getRandomIntUpTo(2)
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

async function getRandomIntUpTo(_nonce: number) {
  'use cache'
  return crypto.randomInt(128)
}
