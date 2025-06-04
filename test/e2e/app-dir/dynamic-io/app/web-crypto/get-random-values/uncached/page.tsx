import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = new Uint8Array(8)
  const second = new Uint8Array(8)
  await crypto.getRandomValues(first)
  await crypto.getRandomValues(second)
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
