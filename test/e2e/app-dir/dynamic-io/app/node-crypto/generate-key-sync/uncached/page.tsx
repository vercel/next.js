import crypto from 'node:crypto'

import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = crypto
    .generateKeySync('hmac', {
      length: 512,
    })
    .export()
  const second = crypto
    .generateKeySync('hmac', {
      length: 512,
    })
    .export()
  return (
    <div>
      <dl>
        <dt>[first] require('node:crypto').generateKeySync(type, options)</dt>
        <dd id="first">{first.toString('hex')}</dd>
        <dt>[second] require('node:crypto').generateKeySync(type, options)</dt>
        <dd id="second">{second.toString('hex')}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
