import { notFound } from 'next/navigation'
import React from 'react'

export default async function Page(props) {
  const params = await props.params
  if (params.dynamic === 'trigger-not-found') {
    notFound()
  }

  return <div>Hello World</div>
}
