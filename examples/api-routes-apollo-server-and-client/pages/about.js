import Link from 'next/link'

export default () => (
  <div>
    This is a static page goto{' '}
    <Link href="/">
      <a>dynamic</a>
    </Link>{' '}
    page.
  </div>
)
