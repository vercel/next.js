import { SentinelValue } from '../../getSentinelValue'

export default async function Page() {
  if (typeof window === 'undefined') {
    await new Promise((r) => process.nextTick(r))
  }
  const random = Math.random()
  return (
    <div>
      <label>random</label>
      <span id="value">{random}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
