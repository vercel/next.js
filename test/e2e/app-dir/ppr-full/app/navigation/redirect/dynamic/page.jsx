import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { Dynamic } from '../../../../components/dynamic'

const Redirect = () => {
  redirect('/navigation/redirect/location')
}

export default function RedirectPage() {
  return (
    <>
      <Suspense
        fallback={<Dynamic pathname="/navigation/redirect/dynamic" fallback />}
      >
        <Dynamic pathname="/navigation/redirect/dynamic" />
      </Suspense>
      <Redirect />
    </>
  )
}
