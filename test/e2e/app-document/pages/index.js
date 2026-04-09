import Link from 'next/link'
export default () => (
  <div>
    <div className="page-index">index</div>
    <span className="css-in-js-class" />
    <Link href="/about" id="about-link">
      about
    </Link>
    <span className="css-in-js-class" />
  </div>
)
