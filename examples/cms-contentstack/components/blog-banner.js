import React from 'react'

export default function BlogBanner({ blog_banner }) {
  return (
    <div
      className="blog-page-banner"
      style={{
        background: `${blog_banner.bg_color ? blog_banner.bg_color : ''}`,
      }}
    >
      <div className="blog-page-content">
        {blog_banner.banner_title && (
          <h1 className="hero-title" {...blog_banner.$?.banner_title}>
            {blog_banner.banner_title}
          </h1>
        )}

        {blog_banner.banner_description && (
          <p
            className="hero-description"
            {...blog_banner.$?.banner_description}
          >
            {blog_banner.banner_description}
          </p>
        )}
      </div>
    </div>
  )
}
