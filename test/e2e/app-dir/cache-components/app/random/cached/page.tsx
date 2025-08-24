import { SentinelValue } from '../../getSentinelValue'

export default async function Page() {
  const random = await getRandom()
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

async function getRandom() {
  'use cache'
  return Math.random()
}
