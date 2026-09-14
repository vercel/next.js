'use client'

import React from 'react'

export default function Page() {
  return (
    <React.Profiler
      id="hello-app-client"
      onRender={(...res) => {
        window.profileResults = window.profileResults || []
        window.profileResults.push(res)
      }}
    >
      <p>hello app client</p>
    </React.Profiler>
  )
}
