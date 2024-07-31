import { Suspense } from 'react'
import { forbidden } from 'next/navigation'

import { Dynamic } from '../../../../components/dynamic'

const Forbidden = () => {
  forbidden()
}

export default function NotFoundPage() {
  return (
    <>
      <Suspense
        fallback={<Dynamic pathname="/navigation/forbidden/dynamic" fallback />}
      >
        <Dynamic pathname="/navigation/forbidden/dynamic" />
      </Suspense>
      <Forbidden />
    </>
  )
}
