import Link from 'next/link'
import { redText } from './red.module.css'

export default function Red() {
  return (
    <>
      <div id="verify-red" className={redText}>
        This text should be red.
      </div>
      <br />
      <Link href="/blue" prefetch={false}>
        <a id="link-blue">Blue</a>
      </Link>
      <br />
      <Link href="/none" prefetch={false}>
        <a id="link-none">None</a>
      </Link>
    </>
  )
}
