export const getServerSideProps = () => {
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
      <p id="gssp">getServerSideProps page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
