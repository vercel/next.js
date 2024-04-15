import React from 'react'

export async function getStaticProps({ params, revalidateReason }) {
  console.log(
    'revalidate-reason/pages/stale.tsx revalidateReason:',
    revalidateReason
  )
  return {
    props: {
      hello: 'world',
    },
    revalidate: 5,
  }
}

export default ({ hello }) => {
  return <p>hello: {hello}</p>
}
