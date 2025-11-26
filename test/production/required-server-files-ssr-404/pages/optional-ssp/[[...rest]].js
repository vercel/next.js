export const getServerSideProps = ({ query, params }) => {
  return {
    props: {
      random: Math.random(),
      query: query,
      params: params || null,
    },
  }
}

export default function Page(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
