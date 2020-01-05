import React from 'react'
import Link from 'next/link'
import { parse, format } from 'date-fns'

function PublishedAt(props) {
  const { link, date } = props
  return (
    <>
      <Link href={link}>
        <a href={link} className="u-url" mcolor="#aaa" {...props}>
          <time className="dt-published">
            {format(parse(date), 'MMMM DD, YYYY')}
          </time>
        </a>
      </Link>
      <style jsx>{`
        a {
          color: #555;
          text-decoration: none;
        }
      `}</style>
    </>
  )
}

export default PublishedAt
