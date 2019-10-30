import Link from 'next/link'
import timeAgo from '../lib/time-ago'
import parse from 'url-parse'

export default ({ id, title, date, url, user, score, commentsCount }) => {
  const { host } = parse(url)
  return (
    <div>
      <div className='title'>
        {url ? (
          <a href={url}>{title}</a>
        ) : (
          <Link href='/item/[id]' as={`/item/${id}`}>
            <a>{title}</a>
          </Link>
        )}
        {url && (
          <span className='source'>
            <a href={`http://${host}`}>{host.replace(/^www\./, '')}</a>
          </span>
        )}
      </div>
      <div className='meta'>
        {score} {plural(score, 'point')} by{' '}
        <Link href='/user/[id]' as={`/user/${user}`}>
          <a>{user}</a>
        </Link>{' '}
        <Link href='/item/[id]' as={`/item/${id}`}>
          <a>
            {timeAgo(new Date(date)) /* note: we re-hydrate due to ssr */} ago
          </a>
        </Link>{' '}
        |{' '}
        <Link href='/item/[id]' as={`/item/${id}`}>
          <a>
            {commentsCount} {plural(commentsCount, 'comment')}
          </a>
        </Link>
      </div>
      <style jsx>{`
        .title {
          font-size: 15px;
          margin-bottom: 3px;
        }

        .title > a {
          color: #000;
          text-decoration: none;
        }

        .title > a:visited {
          color: #828282;
        }

        .meta {
          font-size: 12px;
        }

        .source {
          font-size: 12px;
          display: inline-block;
          margin-left: 5px;
        }

        .source a,
        .meta a {
          color: #828282;
          text-decoration: none;
        }

        .source a:hover,
        .meta a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}

const plural = (n, s) => s + (n === 0 || n > 1 ? 's' : '')
