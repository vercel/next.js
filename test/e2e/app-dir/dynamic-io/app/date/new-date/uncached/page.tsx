import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  if (typeof window === 'undefined') {
    await new Promise((r) => process.nextTick(r))
  }
  const newDate = new Date()
  return (
    <div>
      <label>new Date()</label>
      <span id="value">{newDate.toString()}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
