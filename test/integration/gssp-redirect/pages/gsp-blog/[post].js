export default function Post(props) {
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
      redirect: {
        destination,
        permanent: params.post.includes('permanent'),
      },
    }
  }

  return {
    props: {
      params,
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['first', 'second'].map((post) => ({ params: { post } })),
    fallback: true,
  }
}
