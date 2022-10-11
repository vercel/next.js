export const getStaticProps = ({ params }) => {
  console.log('getStaticProps /optional-ssg/[[...rest]]', params)

  switch (params.rest?.[0]) {
    case 'redirect-1': {
      return {
        redirect: { destination: '/somewhere', permanent: false },
      }
    }
    case 'redirect-2': {
      return {
        redirect: { destination: '/somewhere-else', permanent: false },
        revalidate: 5,
      }
    }
    case 'not-found-1': {
      return {
        notFound: true,
      }
    }
    case 'not-found-2': {
      return {
        notFound: true,
        revalidate: 5,
      }
    }
    case 'props-no-revalidate': {
      return {
        props: {
          random: Math.random(),
          params: params || null,
        },
      }
    }
    default: {
      break
    }
  }

  return {
    props: {
      random: Math.random(),
      params: params || null,
    },
    revalidate: 1,
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export default function Page(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
