import type { GetStaticProps, GetStaticPaths } from 'next'

interface Props {
  slug: string
}

export default function Page({ slug }: Props) {
  return <p>slug: {slug}</p>
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  return {
    props: { slug: String(params?.slug) },
    revalidate: 10,
  }
}
