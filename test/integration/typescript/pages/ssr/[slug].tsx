import { GetServerSideProps } from 'next'

type Params = {
  slug: string
}

type Props = {
  data: string
}

export const getServerSideProps: GetServerSideProps<Props, Params> = async ({
  params,
}) => {
  return {
    props: { data: params!.slug },
  }
}

export default function Page({ data }: Props) {
  return <h1>{data}</h1>
}
