import React from 'react'
import Link from 'next/link'
import parse from 'html-react-parser'
import Image from 'next/image'

class BlogSection extends React.Component {
  render() {
    const fromBlog = this.props.blogs

    function trimBody(string) {
      const body = typeof string === 'string' && string.substr(0, 300)
      const stringLength = body.lastIndexOf(' ')
      return `${body.substring(0, Math.min(body.length, stringLength))}...`
    }
    return (
      <div className="community-section">
        <div className="community-head">
          {fromBlog.title_h2 && <h2>{fromBlog.title_h2}</h2>}
          {fromBlog.view_articles && (
            <Link href={fromBlog.view_articles.href}>
              <a className="btn secondary-btn article-btn">
                {fromBlog.view_articles.title}
              </a>
            </Link>
          )}
        </div>
        <div className="home-featured-blogs">
          {fromBlog.featured_blogs.map((blog, index) => (
            <div className="featured-blog" key={index}>
              {blog.featured_image && (
                <div className="blog-post-img">
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
                {blog.title && <h3>{blog.title}</h3>}
                {typeof blog.body === 'string' && (
                  <div>{parse(trimBody(blog.body))}</div>
                )}
                {blog.url && (
                  <Link href={blog.url} passHref>
                    <a className="blogpost-readmore">{'Read More -->'}</a>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
}
export default BlogSection
