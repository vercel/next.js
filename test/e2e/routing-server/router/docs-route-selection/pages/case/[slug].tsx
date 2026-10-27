import type { GetStaticPaths, GetStaticProps } from 'next'
export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [{ params: { slug: 'WoRk' } }],
  fallback: false,
})
export const getStaticProps: GetStaticProps = async ({ params }) => ({
  props: { slug: params!.slug },
})
export default function Page({ slug }: { slug: string }) {
  return <p>case:{slug}</p>
}
