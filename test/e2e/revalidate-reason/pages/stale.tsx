import React from 'react'

export async function getStaticProps({ params, revalidateReason }) {
  console.log(
    'revalidate-reason/pages/stale.tsx revalidateReason:',
    revalidateReason
  )
  return {
    props: {
      reason: revalidateReason,
    },
    revalidate: 5,
  }
}

export default ({ reason }) => {
  return <p id="reason">revalidate reason: {reason}</p>
}
