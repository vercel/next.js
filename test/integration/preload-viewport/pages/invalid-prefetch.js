import Link from 'next/link'

export default () => (
  <>
    <Link href="/something-invalid-oops" id="invalid-link">
      I'm broken…
    </Link>
  </>
)
