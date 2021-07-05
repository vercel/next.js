import Link from 'next/link'

const Normal = () => (
  <div>
    <p>No AMP for me...</p>
    <Link href="/only-amp">
      <a id="to-amp">To AMP page!</a>
    </Link>
  </div>
)

export default Normal
