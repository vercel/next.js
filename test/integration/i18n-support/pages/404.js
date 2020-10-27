export default function NotFound(props) {
  return (
    <>
      <h1 id="not-found">This page could not be found | 404</h1>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = ({ locale }) => {
  return {
    props: {
      locale,
      is404: true,
    },
  }
}
