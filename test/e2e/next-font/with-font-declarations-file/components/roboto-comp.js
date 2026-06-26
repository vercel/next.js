import Link from 'next/link'
import { roboto } from '../fonts'

export default function Roboto() {
  return (
    <Link href="/inter" className={roboto.className}>
      To inter
    </Link>
  )
}
