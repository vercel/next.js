import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  return { props: { id: params!.id } }
}

export default function Page({ id }: { id: string }) {
  return <p id="route">pages page {id}</p>
}
