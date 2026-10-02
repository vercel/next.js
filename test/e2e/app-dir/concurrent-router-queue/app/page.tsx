import Link from 'next/link'
import { greet } from './actions'
import { ActionButton } from './client-components'

export default function Page() {
  return (
    <>
      <p id="home">home</p>
      <Link href="/target-page" id="to-target-page">
        Go to target page
      </Link>
      <ActionButton action={greet} />
    </>
  )
}
