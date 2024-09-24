'use client'
import { notFound } from 'next/navigation'

export default function Page({ params }) {
  console.log(params)

  if (params.locale !== 'en') {
    notFound()
  }

  return <div>Regular Modal Page</div>
}
