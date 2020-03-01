import Link from 'next/link'
import format from 'date-fns/format'
import { getImageUrl } from 'takeshape-routing'
import theme from './post-list-item.module.css'

export default function PostListItem({
  featureImage,
  title,
  slug,
  _enabledAt,
  deck,
}) {
  return (
    <li>
      <Link href="/posts/[slug]" as={`/posts/${slug}`}>
        <a className={theme.tout}>
          <div>
            {featureImage && (
              <img src={getImageUrl(featureImage.path, { w: 350 })} alt={''} />
            )}
          </div>
          <div>
            <h3>{title}</h3>
            <p>
              <time>{format(new Date(_enabledAt), 'MMMM d, yyyy')}</time>
            </p>
            <p>{deck}</p>
          </div>
        </a>
      </Link>
    </li>
  )
}
