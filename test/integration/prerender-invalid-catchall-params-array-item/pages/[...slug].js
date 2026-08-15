import React from 'react'

export async function getStaticPaths() {
  return { paths: [{ params: { slug: [123] } }], fallback: true }
}

export async function getStaticProps() {
  return {
    props: {
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default function Page() {
  return <div />
}
