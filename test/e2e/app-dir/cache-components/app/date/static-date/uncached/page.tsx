import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  if (typeof window === 'undefined') {
    await new Promise((r) => process.nextTick(r))
  }
  const staticDate = new Date(0)
  return (
    <div>
      <label>new Date(0)</label>
      <span id="value">{staticDate.toString()}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}
