import type { GetServerSideProps } from 'next'

export default function Original({
  query,
}: {
  query: Record<string, string | string[] | undefined>
}) {
  return (
    <main>
      <h1 id="destination">original:{query.kind}</h1>
      <p id="query">{JSON.stringify(query)}</p>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  props: { query },
})
