import React from 'react'
import Link from 'next/link'
import parse from 'html-react-parser'

export default function ArchiveRelative(props) {
  const { blogs } = props
  return (
    <>
      {blogs?.map((blog, idx) => (
        <Link href={blog.url} key={idx}>
          <a>
            <div>
              <h4>{blog.title}</h4>
              {typeof blog.body === 'string' && (
                <div>{parse(blog.body.slice(0, 80))}</div>
              )}
            </div>
          </a>
        </Link>
      ))}
    </>
  )
}
