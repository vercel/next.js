import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import type { ParsedUrlQuery } from 'querystring'

export const getServerSideProps: GetServerSideProps<{
  slug: string
  locale: string
  query: ParsedUrlQuery
}> = async ({ params, locale, query }) => {
  if (typeof params?.slug !== 'string') {
    return { notFound: true }
  }
  if (locale === undefined) {
    throw new Error('Expected a configured locale')
  }
  return { props: { slug: params.slug, locale, query } }
}

export default function Page({
  slug,
  locale,
  query,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <p id={`${locale}-${slug}`}>{`${locale}:${slug}`}</p>
      <pre id="query">{JSON.stringify(query)}</pre>
      <Link
        id="next-page"
        href="/legacy/two?term=next"
        locale="fr"
        prefetch={false}
      >
        French page
      </Link>
    </>
  )
}
