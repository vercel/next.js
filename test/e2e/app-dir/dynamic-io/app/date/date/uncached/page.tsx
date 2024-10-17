import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  if (typeof window === 'undefined') {
    await new Promise((r) => process.nextTick(r))
  }
  const date = Date()
  return (
    <div>
      <label>Date()</label>
      <span id="value">{date}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
