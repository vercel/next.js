import Link from 'next/link'
export default () => (
  <div>
    <div className="page-index">index</div>
    <Link href="/about">
      <a id="about-link">about</a>
    </Link>
  </div>
)
