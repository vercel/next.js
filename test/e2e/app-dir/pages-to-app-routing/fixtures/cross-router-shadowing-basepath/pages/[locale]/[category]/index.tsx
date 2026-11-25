import type { GetServerSidePropsContext } from 'next'

type Props = {
  category: string
  locale: string
}

export default function Category({ category, locale }: Props) {
  return (
    <h1 id="page-title">
      Pages Category: {String(category)} ({locale})
    </h1>
  )
}

export async function getServerSideProps({
  params,
}: GetServerSidePropsContext) {
  return {
    props: {
      category: params?.category,
      locale: params?.locale,
    },
  }
}
