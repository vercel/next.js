'use client'
import { notFound } from 'next/navigation'

export default async function Page({ params }) {
  if ((await params).locale !== 'en') {
    notFound()
  }

  return <div>Regular Modal Page</div>
}
