export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="gsp">getStaticProps page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
