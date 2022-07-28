import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'

export default function SSR({
  framework,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <div>{framework} ssr example</div>
}

export const getServerSideProps: GetServerSideProps<{
  framework: string
}> = async () => {
  return {
    props: { framework: 'preact' },
  }
}
