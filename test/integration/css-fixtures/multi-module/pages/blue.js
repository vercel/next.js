import Link from 'next/link'
import { blueText } from './blue.module.css'

export default function Blue() {
  return (
    <>
      <div id="verify-blue" className={blueText}>
        This text should be blue.
      </div>
      <br />
      <Link href="/red" prefetch>
        <a id="link-red">Red</a>
      </Link>
      <br />
      <Link href="/none" prefetch={false}>
        <a id="link-none">None</a>
      </Link>
    </>
  )
}
