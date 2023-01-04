import { InferGetServerSidePropsType } from 'next'

export function getServerSideProps() {
  return {
    props: { framework: 'preact' },
  }
}

export default function SSRPage({
  framework,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <div>{framework} ssr example</div>
}
