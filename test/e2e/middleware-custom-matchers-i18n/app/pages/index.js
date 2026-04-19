export default (props) => (
  <>
    <h1>home</h1>
    <div id="from-middleware">{props.fromMiddleware}</div>
  </>
)

export async function getServerSideProps({ req, res }) {
  return {
    props: {
      fromMiddleware:
        // TODO: this should only use request header once
        // start is using the separate renders as well
        req.headers['x-from-middleware'] ||
        res.getHeader('x-from-middleware') ||
        null,
    },
  }
}
