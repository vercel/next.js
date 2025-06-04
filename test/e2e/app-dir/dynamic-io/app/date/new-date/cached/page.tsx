import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const newDate = await getNewDate()
  return (
    <div>
      <label>new Date()</label>
      <span id="value">{newDate}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getNewDate() {
  'use cache'
  // We should really return the date object but
  // at the time of writing "use cache" can't serialize the Date
  // back to the server
  return new Date().toString()
}
