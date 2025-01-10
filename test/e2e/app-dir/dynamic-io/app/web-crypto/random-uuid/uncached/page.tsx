import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => process.nextTick(r))
  const first = crypto.randomUUID()
  const second = crypto.randomUUID()
  return (
    <div>
      <dl>
        <dt>[first] crypto.randomUUID()</dt>
        <dd id="first">{first.toString()}</dd>
        <dt>[second] crypto.randomUUID()</dt>
        <dd id="second">{second.toString()}</dd>
      </dl>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
