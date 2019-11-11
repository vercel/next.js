import Link from 'next/link'

export default () => (
  <>
    <h3>Hi 👋</h3>
    <Link href="/a-non-existing-page">
      <a>a lnik to no-where</a>
    </Link>
  </>
)
