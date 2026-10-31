import type { GetServerSidePropsContext } from 'next'

export function getServerSideProps({
  params,
}: GetServerSidePropsContext<{ slug: string }>) {
  return { props: { slug: params!.slug } }
}
export default function Page({ slug }: { slug: string }) {
  return <p id="result">{slug}</p>
}
