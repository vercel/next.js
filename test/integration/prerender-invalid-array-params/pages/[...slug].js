import React from 'react'

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: ['hello', 123, 'world'] } }],
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  return {
    props: {
      slug: params.slug,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default () => {
  return <div />
}
