import React from 'react'
import Link from 'next/link'
import moment from 'moment'
import parse from 'html-react-parser'
import Image from 'next/image'

function BlogList({ blogList }) {
  let body = typeof blogList.body === 'string' && blogList.body.substr(0, 300)
  const stringLength = body.lastIndexOf(' ')
  body = `${body.substr(0, Math.min(body.length, stringLength))}...`
  return (
    <div className="blog-list">
      {blogList.featured_image && (
        <Link href={blogList.url}>
          <a className="blog-list-img" {...blogList.featured_image.$?.url}>
            <Image
              src={blogList.featured_image.url}
              layout="fill"
              alt="blog img"
            />
          </a>
        </Link>
      )}
      <div className="blog-content">
        {blogList.title && (
          <Link href={blogList.url}>
            <h3 {...blogList.$?.title}>{blogList.title}</h3>
          </Link>
        )}
        <p {...blogList.$?.date}>
          {moment(blogList.date).format('ddd, MMM D YYYY')},{' '}
          <strong {...blogList.author[0].$?.title}>
            {blogList.author[0].title}
          </strong>
        </p>
        <span {...blogList.$?.body}>{parse(body)}</span>
        {blogList.url ? (
          <Link href={blogList.url}>
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
