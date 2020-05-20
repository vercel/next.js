import Link from 'next/link'
import PropTypes from 'prop-types'

const ArticleFeatured = ({ slug, title, abstract }) => (
  <div className="jumbotron p-4 p-md-5 text-white rounded bg-dark">
    <div className="col-md-6 px-0">
      <h1 className="display-4 font-italic">{title}</h1>
      <p className="lead my-3">{abstract}</p>
      <p className="lead mb-0">
        <Link href={`/article/${slug}`}>
          <a className="text-white font-weight-bold">Continue reading...</a>
        </Link>
      </p>
    </div>
  </div>
)
ArticleFeatured.propTypes = {
  slug: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  abstract: PropTypes.string.isRequired,
}

export default ArticleFeatured
