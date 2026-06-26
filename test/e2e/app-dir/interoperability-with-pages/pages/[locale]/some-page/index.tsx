import type { GetStaticPropsContext } from 'next'
import Link from 'next/link'

export default function SomePage({ locale }: { locale: string }) {
  return (
    <main id="pages-some-page">
      <h1>Pages Router Some Page</h1>
      <Link id="link-to-app-about" href={`/${locale}/about`}>
        Go to App Router about page
      </Link>
    </main>
  )
}

export function getStaticProps({ params }: GetStaticPropsContext) {
  return {
    props: {
      locale: params?.locale,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [{ params: { locale: 'en' } }],
    fallback: false,
  }
}
