import { useRouter } from 'next/router'

export default function Post(props) {
  const router = useRouter()

  if (typeof window !== 'undefined' && !window.initialHref) {
    window.initialHref = window.location.href
  }

  if (router.isFallback) return <p>Loading...</p>

  return (
    <>
      <p id="gsp">getStaticProps</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = ({ params }) => {
  if (params.post.startsWith('redir')) {
    let destination = '/404'

    if (params.post.includes('dest-')) {
      destination = params.post.split('dest-').pop().replace(/_/g, '/')
    }

    return {
      unstable_redirect: {
        destination,
        permanent: params.post.includes('permanent'),
      },
    }
  }

  return {
    props: {
      params,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['first', 'second'].map((post) => ({ params: { post } })),
    fallback: true,
  }
}
