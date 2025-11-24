import Head from 'next/head'
import AnotherHead from 'next/head.js'
import { useRouter } from 'next/router'
import { useRouter as useRouter2 } from 'next/router.js'

export default function Page() {
  useRouter()
  useRouter2()
  return (
    <>
      <Head>
        <meta name="head-value-1" content="with-ext" />
      </Head>
      <AnotherHead>
        <meta name="head-value-2" content="without-ext" />
      </AnotherHead>
      <div className="root">pages</div>
    </>
  )
}
