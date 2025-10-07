import React from 'react'

export default function Page({ params }) {
  return (
    <h1 id="catch-all">anotherRoute catch-all: {params.slug?.join('/')}</h1>
  )
}
