export const runtime = 'edge'

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
  return Math.random()
}
