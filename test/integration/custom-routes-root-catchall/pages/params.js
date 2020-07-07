export const getServerSideProps = ({ query }) => {
  return {
    props: {
      query,
    },
  }
}

export default function Params(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
