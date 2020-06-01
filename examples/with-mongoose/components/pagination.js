import Link from 'next/link'
import PropTypes from 'prop-types'

const Pagination = ({
  hasNextPage,
  hasPrevPage,
  nextPage,
  prevPage,
  page,
  totalPages,
}) => (
  <nav className="blog-pagination" aria-label="Blog pagination">
    <ul className="pagination justify-content-center">
      <li className={`page-item${hasPrevPage ? '' : ' disabled'}`}>
        <Link href={`?page=${prevPage}`}>
          <a
            className="page-link"
            {...(hasPrevPage
              ? {}
              : { tabIndex: '-1', 'aria-disabled': 'true' })}
          >
            Newer
          </a>
        </Link>
      </li>
      <li className="page-item active">
        <span className="page-link">
          Page {page} of {totalPages}
        </span>
      </li>
      <li className={`page-item${hasNextPage ? '' : ' disabled'}`}>
        <Link href={`?page=${nextPage}`}>
          <a
            className="page-link"
            {...(hasNextPage
              ? {}
              : { tabIndex: '-1', 'aria-disabled': 'true' })}
          >
            Older
          </a>
        </Link>
      </li>
    </ul>
  </nav>
)
Pagination.propTypes = {
  hasNextPage: PropTypes.bool,
  hasPrevPage: PropTypes.bool,
  nextPage: PropTypes.number,
  prevPage: PropTypes.number,
  page: PropTypes.number,
  totalPages: PropTypes.number,
}

export default Pagination
