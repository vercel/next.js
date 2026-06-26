import Link from 'next/link'
import { inter } from '../fonts'

export default function Inter() {
  return (
    <Link href="/roboto" className={inter.className}>
      To roboto
    </Link>
  )
}
