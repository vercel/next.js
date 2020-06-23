import React from 'react'

export async function unstable_getStaticParams() {
  return ['/blog/post-1']
}

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
