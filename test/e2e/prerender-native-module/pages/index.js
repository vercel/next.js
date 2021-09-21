export const getStaticProps = () => {
  return {
    props: {
      index: true,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="index">index page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
