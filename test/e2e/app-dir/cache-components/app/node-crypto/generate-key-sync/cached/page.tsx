import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const first = await getGeneratedKey(1)
  const second = await getGeneratedKey(2)
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').generateKeySync(type, options)</dt>
        <dd id="first">{first.toString()}</dd>
        <dt>[second] require('node:crypto').generateKeySync(type, options)</dt>
        <dd id="second">{second.toString()}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getGeneratedKey(_nonce: number) {
  'use cache'
  return crypto
    .generateKeySync('hmac', {
      length: 512,
    })
    .export()
}
