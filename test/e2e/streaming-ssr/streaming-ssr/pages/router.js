import { useRouter } from 'next/router'
import Link from 'next/link'

export default () => {
  useRouter()
  return <Link href="/">link</Link>
}

export const config = { runtime: 'experimental-edge' }
