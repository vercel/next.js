import Link from 'next/link'
export default () => (
  <div>
    <div className="page-index">index</div>
    <span className="css-in-js-class" />
    <Link href="/about">
      <a id="about-link">about</a>
    </Link>
    <span className="css-in-js-class" />
  </div>
)
