import React from 'react'

export default function Page({ params }) {
  return <h1 id="catch-all">payment catch-all: {params.slug?.join('/')}</h1>
}
