export default function Page(props) {
  return (
    <>
      <p>/[...slug] page</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export const getServerSideProps = async ({ params }) => {
  return {
    props: {
      params,
      page: '[...slug]',
    },
  }
}
