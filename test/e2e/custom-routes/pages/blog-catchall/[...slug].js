export const getStaticProps = ({ params }) => {
  return {
    props: {
      params,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export default function Page(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
