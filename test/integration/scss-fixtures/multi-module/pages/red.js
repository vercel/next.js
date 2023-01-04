import Link from 'next/link'
import { redText } from './red.module.scss'

export default function Red() {
  return (
    <>
      <div id="verify-red" className={redText}>
        This text should be red.
      </div>
      <br />
      <Link href="/blue" prefetch={false} id="link-blue">
        Blue
      </Link>
      <br />
      <Link href="/none" prefetch={false} id="link-none">
        None
      </Link>
    </>
  )
}
