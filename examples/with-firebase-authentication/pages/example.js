import React from 'react'
import Link from 'next/link'

const Example = props => {
  return (
    <div>
      <p>
        This page is static because it does not fetch any data or include the
        authed user info.
      </p>
      <Link href={'/'}>
        <a>Home</a>
      </Link>
    </div>
  )
}

Example.displayName = 'Example'

Example.propTypes = {}

Example.defaultProps = {}

export default Example
