import { useRouter } from 'next/router'

export default function Page(props) {
  if (useRouter().isFallback) {
    return <p>Loading...</p>
  }

  return <p id="props">{JSON.stringify(props)}</p>
}

export function getStaticPaths() {
  return {
    paths: ['/fallback-true-blog/first'],
    fallback: true,
  }
}

export function getStaticProps({ params }) {
  return {
    props: {
      params,
      time: Date.now(),
    },
  }
}
