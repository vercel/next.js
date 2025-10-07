import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const date = await getDate()
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

async function getDate() {
  'use cache'
  return Date()
}
