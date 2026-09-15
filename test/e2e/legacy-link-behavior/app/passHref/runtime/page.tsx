import Link from 'next/link'
import CustomComponent from '../_client'

export const prefetch = 'partial'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <CustomComponent>About</CustomComponent>
      </Link>
    </>
  )
}
