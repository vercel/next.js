import React from 'react'
import Link from 'next/link'
import NProgress from 'nprogress'

export default (props) => (
  <Link
    {...props}
    onStart={() => NProgress.start()}
    onComplete={() => NProgress.done()}
  />
)
