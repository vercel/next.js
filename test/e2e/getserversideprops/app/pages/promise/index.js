export async function getServerSideProps() {
  return {
    props: (async function () {
      return {
        text: 'promise',
      }
    })(),
  }
}

export default ({ text }) => (
  <>
    <div>hello {text}</div>
  </>
)
