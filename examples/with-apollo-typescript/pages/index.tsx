import React from 'react'
import Link from 'next/link'
import { MainLayout } from '@Components/MainLayout'

const Home = (): JSX.Element => {
  return (
    <MainLayout>
      <Link href="/launches-ssr" as="launches-ssr">
        <a>Launches List (SSR)</a>
      </Link>
      <br />
      <Link href="/launches-client" as="launches-client">
        <a>Launches List (Only Client)</a>
      </Link>
    </MainLayout>
  )
}

export default Home
