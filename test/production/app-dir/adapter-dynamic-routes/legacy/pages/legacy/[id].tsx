import type { GetStaticPaths, GetStaticProps } from 'next'

export const getStaticPaths: GetStaticPaths = () => {
  return { paths: [{ params: { id: '1' } }], fallback: false }
}

export const getStaticProps: GetStaticProps<{ id: string }> = ({ params }) => {
  return { props: { id: String(params?.id) } }
}

export default function Page({ id }: { id: string }) {
  return <p>legacy {id}</p>
}
