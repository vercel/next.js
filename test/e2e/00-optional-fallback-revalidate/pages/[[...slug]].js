import { useRouter } from 'next/router'

export default function Home(props) {
  if (useRouter().isFallback) return 'Loading...'
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: ['a'] } }],
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  return {
    props: {
      params,
      random: Math.random() + Date.now(),
    },
    revalidate: 1,
  }
}
