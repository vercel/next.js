import Link from 'next/link'
import PropTypes from 'prop-types'

const Pagination = (props) => (
  <nav className="blog-pagination">
    <Link href={`?page=${props.prevPage}`}>
      <a
        className={`btn ${
          props.hasPrevPage
            ? 'btn-outline-primary'
            : 'btn-outline-secondary disabled'
        }`}
        {...(props.hasPrevPage
          ? {}
          : { tabIndex: '-1', 'aria-disabled': 'true' })}
      >
        Newer
      </a>
    </Link>
    <Link href={`?page=${props.nextPage}`}>
      <a
        className={`btn ${
          props.hasNextPage
            ? 'btn-outline-primary'
            : 'btn-outline-secondary disabled'
        }`}
        {...(props.hasNextPage
          ? {}
          : { tabIndex: '-1', 'aria-disabled': 'true' })}
      >
        Older
      </a>
    </Link>
  </nav>
)
Pagination.propTypes = {
  hasNextPage: PropTypes.bool,
  hasPrevPage: PropTypes.bool,
  nextPage: PropTypes.number,
  prevPage: PropTypes.number,
  page: PropTypes.number,
  limit: PropTypes.number,
  pagingCounter: PropTypes.number,
  totalDocs: PropTypes.number,
  totalPages: PropTypes.number,
}

export default Pagination
