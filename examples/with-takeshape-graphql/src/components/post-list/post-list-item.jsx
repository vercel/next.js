import React from 'react'
import Link from 'next/link'
import format from 'date-fns/format'
import TakeShape from '../../providers/takeshape'
import theme from './post-list-item.module.css'

const PostListItem = props => {
  const { featureImage, title, slug, _enabledAt, deck } = props
  const date = new Date(_enabledAt)
  return (
    <li>
      <Link href="/posts/[slug]" as={`/posts/${slug}`}>
        <a className={theme.tout}>
          <div>
            {featureImage && (
              <img
                src={TakeShape.getImageUrl(featureImage.path, { w: 350 })}
                alt={''}
              />
            )}
          </div>
          <div>
            <h3>{title}</h3>
            <p>
              <time>{format(date, 'MMMM d, yyyy')}</time>
            </p>
            <p>{deck}</p>
          </div>
        </a>
      </Link>
    </li>
  )
}

export default PostListItem
