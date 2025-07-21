import Link from 'next/link'
import { NoInline } from '../no-inline'

export default async function Page() {
  const randomNumber = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(Math.random())
    }, 1000)
  })

  return (
    <>
      <NoInline />
      <div>
        <Link href="/">Back to Home</Link>
      </div>
      <div id="random-number">{randomNumber}</div>
    </>
  )
}
