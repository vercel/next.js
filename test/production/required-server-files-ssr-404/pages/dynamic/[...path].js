export function getServerSideProps({ params }) {
  return {
    props: {
      path: params.path,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="catch-all-page">[...path] page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
