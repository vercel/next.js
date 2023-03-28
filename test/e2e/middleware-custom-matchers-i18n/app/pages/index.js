export default (props) => (
  <>
    <h1>home</h1>
    <div id="from-middleware">{props.fromMiddleware}</div>
  </>
)

export async function getServerSideProps({ req }) {
  return {
    props: {
      fromMiddleware: req.headers['x-from-middleware'] || null,
    },
  }
}
