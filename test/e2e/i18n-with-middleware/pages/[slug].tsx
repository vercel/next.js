import type { GetStaticPaths, GetStaticProps } from 'next'

import Link from 'next/link'

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' }
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      testLocale: locale,
    },
  }
}

export default function Page({
  testLocale,
}: {
  testLocale: string | undefined
}) {
  return (
    <div>
      <Link href="/b">hello world</Link>
      <p>{testLocale}</p>
    </div>
  )
}
