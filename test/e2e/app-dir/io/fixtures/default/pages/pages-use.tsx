import React from 'react'
import { io } from 'next/cache'

export default function PagesUse() {
  if (typeof React.use === 'function') {
    React.use(io())
  }
  return (
    <>
      <p>This page calls React.use(io()) in the component body.</p>
      <div id="pages-content">ok</div>
    </>
  )
}
