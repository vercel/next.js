import React from 'react'

export async function getStaticProps({ params, revalidateReason }) {
  console.log(
    'revalidate-reason/pages/index.tsx revalidateReason:',
    revalidateReason
  )
  return {
    props: {
      hello: 'world',
    },
  }
}

export default ({ hello }) => {
  return <p>hello: {hello}</p>
}
