import * as React from 'react'

export default function Layout({ parallel }: { parallel: React.ReactNode }) {
  return (
    <>
      <h2>LAYOUT</h2>
      {parallel}
    </>
  )
}
