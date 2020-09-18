function Page(props) {
  if (props.name === undefined) {
    return <h1>ValueIsUndefined</h1>
  }
  return <h1>Error</h1>
}

export async function getServerSideProps(context) {
  return {
    props: {
      name: undefined,
      hello: 'World',
    },
  }
}

export default Page
