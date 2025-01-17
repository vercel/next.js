export default function Page() {
  if (typeof window === 'undefined') {
    if (process.env.NEXT_PHASE !== 'phase-production-build')
      throw new Error('pages:stale')
  }

  return <p>{Date.now()}</p>
}

export async function getStaticProps() {
  return {
    props: {
      key: 'value',
    },
    revalidate: 2,
  }
}
