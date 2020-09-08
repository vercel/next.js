export default function Post(props) {
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
