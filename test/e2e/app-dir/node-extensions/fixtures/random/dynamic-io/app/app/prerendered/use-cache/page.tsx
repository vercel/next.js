export default async function Page() {
  return (
    <ul>
      <li>
        <RandomValue />
      </li>
      <li>
        <RandomValue />
      </li>
    </ul>
  )
}

async function RandomValue() {
  return getCachedRandom()
}

async function getCachedRandom() {
  'use cache'
  return Math.random()
}
