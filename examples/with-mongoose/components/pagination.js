import Link from 'next/link'

const Pagination = () => (
  <nav className="blog-pagination">
    <Link href="/">
      <a className="btn btn-outline-primary">Older</a>
    </Link>
    <Link href="/">
      <a
        className="btn btn-outline-secondary disabled"
        tabIndex="-1"
        aria-disabled="true"
      >
        Newer
      </a>
    </Link>
  </nav>
)

export default Pagination
