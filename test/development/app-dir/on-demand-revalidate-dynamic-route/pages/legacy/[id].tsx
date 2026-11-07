import type { GetStaticPaths, GetStaticProps } from 'next'

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' }
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  return { props: { id: params!.id } }
}

export default function Page({ id }: { id: string }) {
  return <p id="route">pages page {id}</p>
}
