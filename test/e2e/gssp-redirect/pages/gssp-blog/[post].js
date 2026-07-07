import { useRouter } from 'next/router'

export default function Post(props) {
  const router = useRouter()

  if (typeof window === 'undefined') {
    if (router.query.post?.startsWith('redir')) {
      console.log(router)
      throw new Error('render should not occur for redirect')
    }
  }

  return (
    <>
      <p id="gssp">getServerSideProps</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getServerSideProps = ({ params }) => {
  if (params.post.startsWith('redir')) {
    let destination = '/404'

    if (params.post.includes('dest-external')) {
      destination = 'https://example.vercel.sh'
    } else if (params.post.includes('dest-')) {
      destination = params.post.split('dest-').pop().replace(/_/g, '/')
    }

    let permanent = undefined
    let statusCode = undefined

    if (params.post.includes('statusCode-')) {
      statusCode = parseInt(
        params.post.split('statusCode-').pop().split('-').shift(),
        10
      )
    }

    if (params.post.includes('permanent')) {
      permanent = true
    } else if (!statusCode) {
      permanent = false
    }

    return {
      redirect: {
        destination,
        permanent,
        statusCode,
      },
    }
  }

  return {
    props: {
      params,
    },
  }
}
