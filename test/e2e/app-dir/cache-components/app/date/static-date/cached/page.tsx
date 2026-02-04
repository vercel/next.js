import { SentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const staticDate = await getStaticDate()
  return (
    <div>
      <label>new Date(0)</label>
      <span id="value">{staticDate}</span>
      <span id="page">
        <SentinelValue />
      </span>
    </div>
  )
}

async function getStaticDate() {
  'use cache'
  // We should really return the date object but
  // at the time of writing "use cache" can't serialize the Date
  // back to the server
  return new Date(0).toString()
}
