export async function getServerSideProps({ query }) {
  return {
    props: {
      query,
    },
  }
}

export default function Page(props) {
  return <div id="optional-route">{props.query.optionalName.join('/')}</div>
}
