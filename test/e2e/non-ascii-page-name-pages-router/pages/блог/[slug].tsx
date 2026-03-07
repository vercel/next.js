import type { InferGetServerSidePropsType, GetServerSideProps } from 'next'

type Props = {
  slug: string
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  params,
}) => {
  return {
    props: {
      slug: String(params?.slug ?? ''),
    },
  }
}

export default function BlogPost({
  slug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <p>blog post: {slug}</p>
}
