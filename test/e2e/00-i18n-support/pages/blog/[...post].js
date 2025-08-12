export const getStaticPaths = ({ locales }) => {
  const paths = []

  for (const locale of locales) {
    paths.push({
      locale,
      params: {
        post: ['hello', 'world'],
      },
    })
    paths.push({
      locale,
      params: {
        post: ['not', 'found'],
      },
    })
    paths.push({
      locale,
      params: {
        post: ['no', 'revalidate'],
      },
    })
  }

  return {
    paths,
    fallback: false,
  }
}

export const getStaticProps = ({ params }) => {
  if (params.post[0] === 'no') {
    return {
      props: {
        no: 'revalidate',
        random: Math.random() + Date.now(),
      },
      revalidate: false,
    }
  }
  if (params.post[0] === 'not') {
    return {
      notFound: true,
    }
  }
  return {
    props: {
      params,
      hello: 'world',
      random: Math.random() + Date.now(),
    },
    revalidate: 1,
  }
}

export default function Page(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
