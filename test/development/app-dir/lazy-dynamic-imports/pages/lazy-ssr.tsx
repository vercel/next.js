import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps<{ value: string }> = async (
  context
) => {
  if (!context.query.load) return { props: { value: 'idle' } }

  const { value } = await import('../lib/lazy-pages-ssr-target')
  return { props: { value } }
}

export default function Page({ value }: { value: string }) {
  return <p id="pages-ssr-lazy-value">{value}</p>
}
