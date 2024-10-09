import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = crypto.generateKeyPairSync('rsa', keyGenOptions)
  const second = crypto.generateKeyPairSync('rsa', keyGenOptions)
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

const keyGenOptions = {
  modulusLength: 512,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
} as const
