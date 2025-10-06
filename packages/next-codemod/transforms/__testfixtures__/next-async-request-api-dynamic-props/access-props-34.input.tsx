import React from 'react'

export default function Page({ params }: { params: { slug: string } }) {
  React.use()
  return <p>child {params.slug}</p>
}
