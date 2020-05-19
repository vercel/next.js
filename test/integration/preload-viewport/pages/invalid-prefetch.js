import Link from 'next/link'

export default () => (
  <>
    <Link href="/something-invalid-oops">
      <a id="invalid-link">I'm broken...</a>
    </Link>
  </>
)
