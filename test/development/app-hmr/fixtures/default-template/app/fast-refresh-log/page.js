import Link from 'next/link'
import { Message } from './message'

export default function Page() {
  return (
    <>
      <Message />
      <Link href="/fast-refresh-log/other" id="to-other">
        To other
      </Link>
    </>
  )
}
