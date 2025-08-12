export default function Page(props) {
  return (
    <>
      <p>index page</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async () => {
  return {
    props: {
      page: 'index',
      now: Date.now(),
    },
  }
}
