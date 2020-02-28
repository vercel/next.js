import React from 'react'

// eslint-disable-next-line camelcase
export async function getStaticPaths() {
  return { paths: [{ params: { slug: 'hello' } }], fallback: true }
}

// eslint-disable-next-line camelcase
export async function getStaticProps({ params }) {
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
