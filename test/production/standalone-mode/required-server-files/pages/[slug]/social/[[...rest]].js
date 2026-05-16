export const getStaticProps = ({ params }) => {
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
  return (
    <>
      <p id="page">/[slug]/social/[[...rest]]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
