import type { GetServerSidePropsContext } from 'next'
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
    </>
  )
}

export async function getServerSideProps({
  params,
}: GetServerSidePropsContext) {
  return {
    props: {
      locale: params?.locale,
    },
  }
}
