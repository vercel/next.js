import React from 'react'

// eslint-disable-next-line camelcase
export async function unstable_getStaticPaths() {
  return [{ params: { slug: 'hello' } }]
}

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default () => {
  return <div />
}
