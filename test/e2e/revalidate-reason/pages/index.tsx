import React from 'react'

export async function getStaticProps({ params, revalidateReason }) {
  console.log(
    'revalidate-reason/pages/index.tsx revalidateReason:',
    revalidateReason
  )
  return {
    props: {
      reason: revalidateReason,
    },
    // TODO: Deploy tests occasionally fail since we revalidate due to staleness.
    // But the default is apparently "no revalidation" (https://nextjs.org/docs/canary/pages/api-reference/functions/get-static-props#revalidate)
    // This hints at a bug.
    // The high duration is just a workaround to check if this unflakes the test.
    revalidate: 60 * 60 * 24 * 365,
  }
}

export default ({ reason }) => {
  return <p id="reason">revalidate reason: {reason}</p>
}
