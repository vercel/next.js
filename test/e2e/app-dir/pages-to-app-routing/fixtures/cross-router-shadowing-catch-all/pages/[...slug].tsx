import type { GetServerSidePropsContext } from 'next'

type Props = {
  slug: string[]
}

export default function Catchall({ slug }: Props) {
  return <h1 id="page-title">Pages Catchall: {slug.join('/')}</h1>
}

export async function getServerSideProps({
  params,
}: GetServerSidePropsContext) {
  return {
    props: {
      slug: (params?.slug as string[]) ?? [],
    },
  }
}
