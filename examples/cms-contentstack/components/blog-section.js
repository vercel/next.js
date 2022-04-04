import React from 'react'
import Link from 'next/link'
import parse from 'html-react-parser'
import Image from 'next/image'

export default function BlogSection({ fromBlog }) {
  function trimBody(string) {
    const body = typeof string === 'string' && string.substr(0, 300)
    const stringLength = body.lastIndexOf(' ')
    return `${body.substring(0, Math.min(body.length, stringLength))}...`
  }
  return (
    <div className="community-section">
      <div className="community-head">
        {fromBlog.title_h2 && (
          <h2 {...fromBlog.$?.title_h2}>{fromBlog.title_h2}</h2>
        )}
        {fromBlog.view_articles && (
          <Link href={fromBlog.view_articles.href}>
            <a
              className="btn secondary-btn article-btn"
              {...fromBlog.view_articles.$?.title}
            >
              {fromBlog.view_articles.title}
            </a>
          </Link>
        )}
      </div>
      <div className="home-featured-blogs">
        {fromBlog.featured_blogs.map((blog, index) => (
          <div className="featured-blog" key={index}>
            {blog.featured_image && (
              <div className="blog-post-img" {...blog.featured_image.$?.url}>
                <Image
                  width={522}
                  height={272}
                  layout="fixed"
                  src={blog.featured_image.url}
                  alt={blog.featured_image.filename}
                />
              </div>
            )}
            <div className="featured-content">
              {blog.title && <h3 {...blog.$?.title}>{blog.title}</h3>}
              {typeof blog.body === 'string' && (
                <div {...blog.$?.body}>{parse(trimBody(blog.body))}</div>
              )}
              {blog.url && (
                <Link href={blog.url} passHref>
                  <a className="blogpost-read-more" {...blog.$?.url}>
                    {'Read More -->'}
                  </a>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
