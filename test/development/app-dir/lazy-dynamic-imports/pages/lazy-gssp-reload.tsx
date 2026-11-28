import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps<{
  value: string
}> = async () => {
  const { value } = await import('../lib/lazy-gssp-reload-target')
  return { props: { value } }
}

export default function Page({ value }: { value: string }) {
  return <p id="lazy-gssp-reload">{value}</p>
}
