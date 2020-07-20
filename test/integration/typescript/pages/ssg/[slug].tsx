import { GetStaticPaths, GetStaticProps } from 'next'

type Params = {
  slug: string
}

type Props = {
  data: string
}

export const getStaticPaths: GetStaticPaths<Params> = async () => {
  return {
    paths: [{ params: { slug: 'test' } }],
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps<Props, Params> = async ({
  params,
}) => {
  return {
    props: { data: params!.slug },
    revalidate: false,
  }
}

export default function Page({ data }: Props) {
  return <h1>{data}</h1>
}
