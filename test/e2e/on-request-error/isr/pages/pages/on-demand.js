export default function Page() {
  if (typeof window === 'undefined') {
    if (process.env.NEXT_PHASE !== 'phase-production-build')
      throw new Error('pages:on-demand')
  }
  return <p>{Date.now()}</p>
}

export const revalidate = 1000
export async function getServerSideProps() {
  return {
    props: {
      key: 'value',
    },
  }
}
