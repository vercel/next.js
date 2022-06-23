import React from 'react'
import Link from 'next/link'

export default () => (
  <div>
    <Link
      href={{ pathname: '/dynamic/[slug]/route', query: { slug: 'query' } }}
    >
      <a id="to-dynamic">to dynamic</a>
    </Link>
    <Link
      href={{
        pathname: '/dynamic/catch-all/[...slug]',
        query: { slug: ['query'] },
      }}
      as="/human-readable"
    >
      <a id="to-catch-all-1-parameter">to catch all 1 parameter</a>
    </Link>
    <Link
      href={{
        pathname: '/dynamic/catch-all/[...slug]',
        query: { slug: ['que', 'ry'] },
      }}
      as="/human-readable"
    >
      <a id="to-catch-all-2-parameters">to catch all 2 parameters</a>
    </Link>
    <Link
      href={{
        pathname: '/dynamic/catch-all-optional/[[...slug]]',
        query: { slug: [] },
      }}
      as="/human-readable"
    >
      <a id="to-catch-all-optional-0-parameters">
        to catch all optional 0 parameters
      </a>
    </Link>
    <Link
      href={{
        pathname: '/dynamic/catch-all-optional/[[...slug]]',
        query: { slug: ['query'] },
      }}
      as="/human-readable"
    >
      <a id="to-catch-all-optional-1-parameter">
        to catch all optional 1 parameter
      </a>
    </Link>
    <Link
      href={{
        pathname: '/dynamic/catch-all-optional/[[...slug]]',
        query: { slug: ['que', 'ry'] },
      }}
      as="/human-readable"
    >
      <a id="to-catch-all-optional-2-parameters">
        to catch all optional 2 parameters
      </a>
    </Link>
  </div>
)
