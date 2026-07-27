import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const first = await getGeneratedKeyPair(1)
  const second = await getGeneratedKeyPair(2)
  return (
    <div>
      <dl>
        <dt>
          [first] require('node:crypto').generateKeyPairSync(type, options)
        </dt>
        <dd id="first">{first.publicKey}</dd>
        <dt>
          [second] require('node:crypto').generateKeyPairSync(type, options)
        </dt>
        <dd id="second">{second.publicKey}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getGeneratedKeyPair(_nonce: number) {
  'use cache'
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 512,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })
}
