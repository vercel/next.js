export async function getServerSideProps({ query }) {
  return {
    props: {
      query,
    },
  }
}

export default function Page(props) {
  return (
    <div id="optional-route">
      top level route param:{' '}
      {props.query.optionalName === undefined
        ? 'undefined'
        : `[${props.query.optionalName.join(',')}]`}
    </div>
  )
}
