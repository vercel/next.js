import { useRouter } from 'next/router'

export async function unstable_getStaticProps({ params: { slug } }) {
  if (slug[0] === 'delayby3s') {
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  return {
    props: {
      slug,
    },
    revalidate: 1,
  }
}

export async function unstable_getStaticPaths() {
  return {
    paths: [
      { params: { slug: ['first'] } },
      '/catchall/second',
      { params: { slug: ['another', 'value'] } },
      '/catchall/hello/another',
    ],
  }
}

export default ({ slug }) => {
  const { isFallback } = useRouter()
  if (isFallback) {
    return <p id="catchall">fallback</p>
  }
  return <p id="catchall">Hi {slug.join(' ')}</p>
}
