import { GetStaticPaths, GetStaticProps } from 'next'

type Params = {
  slug: string
}

type Props = {
  data: string
  title: string
}

type PreviewData = {
  title: string
}

export const getStaticPaths: GetStaticPaths<Params> = async () => {
  return {
    paths: [{ params: { slug: 'test' } }],
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps<
  Props,
  Params,
  PreviewData
> = async ({ params, previewData }) => {
  return {
    props: {
      data: params!.slug,
      title: previewData?.title || 'default title',
    },
    revalidate: false,
  }
}

export default function Page({ data, title }: Props) {
  return (
    <h1>
      {data} {title}
    </h1>
  )
}
