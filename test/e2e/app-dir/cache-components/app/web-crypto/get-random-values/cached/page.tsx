import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const first = await getRandomValues(1)
  const second = await getRandomValues(2)
  return (
    <div>
      <dl>
        <dt>[first] crypto.getRandomValues()</dt>
        <dd id="first">{first.toString()}</dd>
        <dt>[second] crypto.getRandomValues()</dt>
        <dd id="second">{second.toString()}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getRandomValues(_nonce: number) {
  'use cache'
  const randomBytes = new Uint8Array(8)
  crypto.getRandomValues(randomBytes)
  return randomBytes
}
