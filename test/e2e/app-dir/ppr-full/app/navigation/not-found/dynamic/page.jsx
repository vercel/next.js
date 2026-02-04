import { Suspense } from 'react'
import { notFound } from 'next/navigation'

import { Dynamic } from '../../../../components/dynamic'

const NotFound = () => {
  notFound()
}

export default function NotFoundPage() {
  return (
    <>
      <Suspense
        fallback={<Dynamic pathname="/navigation/not-found/dynamic" fallback />}
      >
        <Dynamic pathname="/navigation/not-found/dynamic" />
      </Suspense>
      <NotFound />
    </>
  )
}
