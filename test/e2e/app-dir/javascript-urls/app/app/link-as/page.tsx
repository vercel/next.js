import Link from 'next/link'

import { DANGEROUS_JAVASCRIPT_URL } from '../../../bad-url'

export default function Page() {
  return (
    <>
      <p>
        Clicking this link should result in an error where React blocks a
        javascript URL
      </p>
      {/* In App Router as supercedes href but functionally it acts just like an href */}
      <Link href="/" as={DANGEROUS_JAVASCRIPT_URL}>
        Link with javascript URL `as`
      </Link>
    </>
  )
}
