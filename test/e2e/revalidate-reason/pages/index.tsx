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
  }
}

export default ({ reason }) => {
  return <p id="reason">revalidate reason: {reason}</p>
}
