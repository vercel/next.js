import { notFound } from 'next/navigation'
import React from 'react'

export default function Page({ params }) {
  if (params.dynamic === 'trigger-not-found') {
    notFound()
  }

  return <div>Hello World</div>
}
