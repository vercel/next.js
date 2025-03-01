import React from 'react'
import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [
    {
      slug: 'first',
    },
    {
      slug: 'second',
    },
  ]
}

export default async function Page(props: {
  params: Promise<{ slug: string }>
}) {
  const params = await props.params
  await fetch('https://next-data-api.vercel.app/api/random', {
    next: {
      tags: ['explicit-tag'],
    },
  })

  if (
    params.slug !== 'second' &&
    process.env.NEXT_PHASE === 'phase-production-build'
  ) {
    notFound()
  }

  return (
    <>
      <p>/prerendered-not-found/{params.slug}</p>
      <p>{Date.now()}</p>
    </>
  )
}
