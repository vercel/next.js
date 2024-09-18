'use client'

import { use } from 'react'

import { notFound } from 'next/navigation'

export default function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  if (use(params).locale !== 'en') {
    notFound()
  }

  return <div>Regular Modal Page</div>
}
