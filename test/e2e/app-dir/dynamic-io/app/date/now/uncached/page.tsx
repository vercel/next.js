import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  if (typeof window === 'undefined') {
    await new Promise((r) => process.nextTick(r))
  }
  const now = Date.now()
  return (
    <div>
      <label>now</label>
      <span id="value">{now}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
