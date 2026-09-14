import { GetServerSideProps } from 'next'

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

export const getServerSideProps: GetServerSideProps<
  Props,
  Params,
  PreviewData
> = async ({ params, previewData }) => {
  return {
    props: { data: params!.slug, title: previewData?.title || 'default title' },
  }
}

export default function Page({ data, title }: Props) {
  return (
    <h1>
      {data} {title}
    </h1>
  )
}
