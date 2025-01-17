import Link from 'next/link'
import { INVALID_URL } from '../invalid-url'
import { Delay } from '../delay'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <>
      <Link href={INVALID_URL}>invalid link</Link>
      <Delay>
        <h1>Hello, world!</h1>
      </Delay>
    </>
  )
}
