export default function Page() {
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('app:on-demand')
  }
  return <p>{Date.now()}</p>
}

export const revalidate = 1000
