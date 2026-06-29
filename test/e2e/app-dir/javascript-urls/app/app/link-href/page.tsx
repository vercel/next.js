import Link from 'next/link'

import { DANGEROUS_JAVASCRIPT_URL } from '../../../bad-url'

export default function Page() {
  return (
    <>
      <p>
        Clicking this link should result in an error where React blocks a
        javascript URL
      </p>
      <Link href={DANGEROUS_JAVASCRIPT_URL}>
        Link with javascript URL `href`
      </Link>
    </>
  )
}
