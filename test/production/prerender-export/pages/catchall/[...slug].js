import { useRouter } from 'next/router'

export async function getStaticProps({ params: { slug } }) {
  if (slug[0] === 'delayby3s') {
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  return {
    props: {
      slug,
    },
  }
}

export async function getStaticPaths() {
  return {
    paths: [
      { params: { slug: ['first'] } },
      '/catchall/second',
      { params: { slug: ['another', 'value'] } },
      '/catchall/hello/another',
    ],
    fallback: false,
  }
}

export default ({ slug }) => {
  const { isFallback } = useRouter()
  if (isFallback) {
    return <p id="catchall">fallback</p>
  }
  return <p id="catchall">Hi {slug.join(' ')}</p>
}
