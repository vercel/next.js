import React from 'react'
import Link from 'next/link'
import moment from 'moment'
import parse from 'html-react-parser'
import Image from 'next/image'

function BlogList({ bloglist }) {
  let body = typeof bloglist.body === 'string' && bloglist.body.substr(0, 300)
  const stringLength = body.lastIndexOf(' ')
  body = `${body.substr(0, Math.min(body.length, stringLength))}...`
  return (
    <div className="blog-list">
      {bloglist.featured_image && (
        <Link href={bloglist.url}>
          <a className="blog-list-img" {...bloglist.featured_image.$?.url}>
            <Image
              src={bloglist.featured_image.url}
              layout="fill"
              alt="blog img"
            />
          </a>
        </Link>
      )}
      <div className="blog-content">
        {bloglist.title && (
          <Link href={bloglist.url}>
            <h3 {...bloglist.$?.title}>{bloglist.title}</h3>
          </Link>
        )}
        <p {...bloglist.$?.date}>
          {moment(bloglist.date).format('ddd, MMM D YYYY')},{' '}
          <strong {...bloglist.author[0].$?.title}>
            {bloglist.author[0].title}
          </strong>
        </p>
        <span {...bloglist.$?.body}>{parse(body)}</span>
        {bloglist.url ? (
          <Link href={bloglist.url}>
            <a>
              <span>{'Read more -->'}</span>
            </a>
          </Link>
        ) : (
          ''
        )}
      </div>
    </div>
  )
}

export default BlogList
