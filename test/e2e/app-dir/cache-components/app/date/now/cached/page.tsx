import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const now = await getNow()
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

async function getNow() {
  'use cache'
  return Date.now()
}
