import React from 'react'
import { unstable_io } from 'next/cache'

export default function PagesUse() {
  if (typeof React.use === 'function') {
    React.use(unstable_io())
  }
  return (
    <>
      <p>This page calls React.use(unstable_io()) in the component body.</p>
      <div id="pages-content">ok</div>
    </>
  )
}
