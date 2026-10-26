import type { GetStaticPropsContext } from 'next'

let revalidationAttempts = 0

export async function getStaticProps({
  revalidateReason,
}: GetStaticPropsContext) {
  if (revalidateReason === 'build') {
    return { props: { generation: 'build' }, revalidate: 1 }
  }

  revalidationAttempts++
  console.log(`Background revalidation attempt: ${revalidationAttempts}`)

  if (revalidationAttempts === 1) {
    // Simulate data fetching that never settles during the first revalidation.
    await new Promise(() => {})
  }

  return {
    props: { generation: `revalidation-${revalidationAttempts}` },
    revalidate: 1,
  }
}

export default function Page({ generation }: { generation: string }) {
  return <p id="generation">{generation}</p>
}
