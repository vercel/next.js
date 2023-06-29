import React from 'react'

export default function Page() {
  return (
    <React.Profiler id="hello">
      <p>hello app server</p>
    </React.Profiler>
  )
}
