import { useRouter } from 'next/router'

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/api-docs/first'],
    fallback: true,
  }
}

export default function Slug(props) {
  if (useRouter().isFallback) return 'Loading...'

  return (
    <>
      <p id="api-docs">API Docs</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
