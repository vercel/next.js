export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  }
}

export default props => (
  <>
    <h3 id="gssp">getServerSideProps</h3>
    <p id="props">{JSON.stringify(props)}</p>
  </>
)
