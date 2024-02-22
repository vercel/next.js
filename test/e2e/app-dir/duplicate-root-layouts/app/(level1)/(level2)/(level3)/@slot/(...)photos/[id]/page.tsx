import React from 'react'

export default function Page({ params }: { params: { id: string } }) {
  return <div>Intercepted Photo Page {params.id}</div>
}
