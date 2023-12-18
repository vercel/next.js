import Link from 'next/link'
import { getData } from './actions'

export default async function Home() {
  const data = await getData()
  const randomNumber = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
    <div>
      <Link href="/revalidate-modal">Open Revalidate Modal</Link>
      <Link href="/refresh-modal">Open Refresh Modal</Link>
      <Link href="/redirect-modal">Open Redirect Modal</Link>
      <div id="random-number">{randomNumber}</div>
      <div>
        <h1>Current Data</h1>
        <ul id="entries">
          {data.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
