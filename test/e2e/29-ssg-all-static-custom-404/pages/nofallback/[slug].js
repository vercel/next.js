import React from 'react'

// eslint-disable-next-line camelcase
export async function getStaticPaths() {
  return {
    paths: ['/nofallback/one', { params: { slug: 'two' } }],
    fallback: false,
  }
}

// eslint-disable-next-line camelcase
export async function getStaticProps({ params }) {
  return {
    props: {
      slug: params.slug,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ slug, time }) => {
  return (
    <>
      <p>
        Slug ({slug.length}): {slug}
      </p>
      <span>time: {time}</span>
    </>
  )
}
