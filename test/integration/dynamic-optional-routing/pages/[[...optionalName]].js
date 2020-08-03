export async function getServerSideProps({ query }) {
  return {
    props: {
      query,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <div id="route">
        top level route param:{' '}
        {props.query.optionalName === undefined
          ? 'undefined'
          : `[${props.query.optionalName.join('|')}]`}
      </div>
      <div id="keys">{JSON.stringify(Object.keys(props.query))}</div>
    </>
  )
}
