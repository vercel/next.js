import Link from 'next/link'

const Index = () => (
  <div>
    <div className="page-index">index</div>
    <Link href="/about">
      <a id="about-link">about</a>
    </Link>
  </div>
)

export default Index
