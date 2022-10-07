import Link from 'next/link'
import { roboto } from '../fonts'

export default function Roboto() {
  return (
    <Link href="/inter">
      <a className={roboto.className}>To inter</a>
    </Link>
  )
}
