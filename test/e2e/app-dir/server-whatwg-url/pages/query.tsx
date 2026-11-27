import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async ({
  query,
  resolvedUrl,
}) => ({
  props: { query, resolvedUrl },
})

export default function Page(props: unknown) {
  return <pre id="result">{JSON.stringify(props)}</pre>
}
