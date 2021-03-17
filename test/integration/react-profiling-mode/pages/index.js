import React from 'react'

const Index = () => {
  return (
    <React.Profiler
      id="hello"
      onRender={(...res) => {
        window.profileResults = window.profileResults || []
        window.profileResults.push(res)
      }}
    >
      <p>hello world</p>
    </React.Profiler>
  )
}

export default Index
