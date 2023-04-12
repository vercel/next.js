import Link from 'next/link'
import React from 'react'

export default () => (
  <div>
    <h1 id="version">{React.version}</h1>
    <div className="page-index">index</div>
    <span className="css-in-js-class" />
    <Link href="/about" id="about-link">
      about
    </Link>
    <span className="css-in-js-class" />
  </div>
)
