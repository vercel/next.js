import Link from 'next/link'
import PropTypes from 'prop-types'

import { articleShape } from 'libs/prop-types'

const dateFormat = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})
const Article = ({ article, preview }) => (
  <article className="blog-post">
    <h2 className="blog-post-title">{article.title}</h2>
    <p className="blog-post-meta">
      {dateFormat.format(new Date(article.createdAt))} &nbsp;&nbsp;
      <Link href={`/category/${article.category.slug}`}>
        <a className="badge badge-dark">{article.category.name}</a>
      </Link>
    </p>
    <section>
      {preview
        ? article.abstract
        : article.body
            .split('\n')
            .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>
    {preview && (
      <p className="mt-2">
        <Link href={`/article/${article.slug}`}>
          <a className="btn btn-link px-0">Continue reading</a>
        </Link>
      </p>
    )}
  </article>
)

Article.propTypes = {
  article: articleShape,
  preview: PropTypes.bool,
}

Article.defaultProps = {
  preview: false,
}

export default Article
