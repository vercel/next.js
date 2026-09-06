import type { GetStaticPropsContext } from 'next'
import Link from 'next/link'

type Props = {
  locale: string
}

export default function SomePage({ locale }: Props) {
  return (
    <>
      <h1 id="page-title">Pages Some Page: {locale}</h1>
      <Link id="to-locale-about-link" href={`/${locale}/about`}>
        To App About
      </Link>
      <Link id="to-category-link" href={`/${locale}/products`}>
        To Pages Category
      </Link>
    </>
  )
}

export async function getStaticProps({ params }: GetStaticPropsContext) {
  return {
    props: {
      locale: params?.locale,
    },
  }
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { locale: 'en' } }],
    fallback: false,
  }
}
