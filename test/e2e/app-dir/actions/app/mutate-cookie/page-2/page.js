import { cookies } from 'next/headers'
import Link from 'next/link'

export default async function Page() {
  return (
    <>
      <Link id="back" href="/mutate-cookie">
        back
      </Link>
      <p id="value">{(await cookies()).get('test-cookie2')?.value}</p>
    </>
  )
}
