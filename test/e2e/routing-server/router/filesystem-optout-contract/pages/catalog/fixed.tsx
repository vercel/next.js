import type { GetServerSidePropsContext } from 'next'
export function getServerSideProps({ query }: GetServerSidePropsContext) {
  return { props: { marker: 'static catalog', query } }
}
export default function Page(props: {
  marker: string
  query: GetServerSidePropsContext['query']
}) {
  return <pre id="catalog">{JSON.stringify(props)}</pre>
}
