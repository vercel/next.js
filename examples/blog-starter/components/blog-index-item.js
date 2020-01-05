import Link from 'next/link'
import PublishedAt from './utils/published-at'

const Post = ({ title, summary, date, path }) => (
  <article>
    <header>
      <h2>
        <Link href={path}>
          <a>{title}</a>
        </Link>
      </h2>

      <PublishedAt link={path} date={date} />
    </header>
    <div className="post-summary">{summary}</div>
    <style jsx>{`
      article {
        margin-bottom: 2em;
      }

      a {
        text-decoration: none;
      }

      .post-summary {
        margin-top: 1em;
      }
    `}</style>
  </article>
)

export default Post
