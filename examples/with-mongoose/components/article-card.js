import Link from 'next/link'
import PropTypes from 'prop-types'

import { categoryShape } from './header'

const dateFormat = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
const Thumbnail = () => (
  <svg
    className="bd-placeholder-img"
    width="200"
    height="250"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice"
    focusable="false"
    role="img"
    aria-label="Placeholder: Thumbnail"
  >
    <title>Placeholder</title>
    <rect width="100%" height="100%" fill="#55595c" />
    <text x="50%" y="50%" fill="#eceeef" dy=".3em">
      Thumbnail
    </text>
  </svg>
)
const ArticleCard = ({ slug, title, abstract, cover, category, createdAt }) => (
  <div className="col-md-6">
    <div className="row no-gutters border rounded overflow-hidden flex-md-row mb-4 shadow-sm h-md-250 position-relative">
      <div className="col p-4 d-flex flex-column position-static">
        <strong className="d-inline-block mb-2 text-primary">
          {category.name}
        </strong>
        <h3 className="mb-0">{title}</h3>
        <time className="mb-1 text-muted" dateTime={createdAt}>
          {dateFormat.format(new Date(createdAt))}
        </time>
        <p className="card-text mb-auto text-truncate">{abstract}</p>
        <Link href={`/article/${slug}`}>
          <a className="stretched-link">Continue reading</a>
        </Link>
      </div>
      <div className="col-auto d-none d-lg-block">
        {cover ? <img src={cover.url} alt={cover.alt} /> : <Thumbnail />}
      </div>
    </div>
  </div>
)
ArticleCard.propTypes = {
  slug: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  abstract: PropTypes.string.isRequired,
  category: categoryShape,
  cover: PropTypes.shape({
    url: PropTypes.string.isRequired,
    alt: PropTypes.string,
  }),
  createdAt: PropTypes.string.isRequired,
}

export default ArticleCard
