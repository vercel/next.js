import Link from 'next/link'

export default () => (
  <div>
    <p>No AMP for me...</p>
    <Link href="/only-amp" id="to-amp">
      To AMP page!
    </Link>
  </div>
)
