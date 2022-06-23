import React from 'react'
import Link from 'next/link'

export default () => (
  <div>
    <Link href="/dynamic/[slug]/route" as="/dynamic/asPath/route">
      <a id="to-dynamic">to dynamic</a>
    </Link>
    <Link href="/dynamic/catch-all/[...slug]" as="/dynamic/catch-all/asPath">
      <a id="to-catch-all-1-parameter">to catch all 1 parameter</a>
    </Link>
    <Link href="/dynamic/catch-all/[...slug]" as="/dynamic/catch-all/as/Path">
      <a id="to-catch-all-2-parameters">to catch all 2 parameters</a>
    </Link>
    <Link
      href="/dynamic/catch-all-optional/[[...slug]]"
      as="/dynamic/catch-all-optional"
    >
      <a id="to-catch-all-optional-0-parameters">
        to catch all optional 0 parameters
      </a>
    </Link>
    <Link
      href="/dynamic/catch-all-optional/[[...slug]]"
      as="/dynamic/catch-all-optional/asPath"
    >
      <a id="to-catch-all-optional-1-parameter">
        to catch all optional 1 parameter
      </a>
    </Link>
    <Link
      href="/dynamic/catch-all-optional/[[...slug]]"
      as="/dynamic/catch-all-optional/as/Path"
    >
      <a id="to-catch-all-optional-2-parameters">
        to catch all optional 2 parameters
      </a>
    </Link>
  </div>
)
