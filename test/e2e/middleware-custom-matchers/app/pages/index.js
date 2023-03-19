export default (props) => (
  <>
    <h1>home</h1>
    <div id="from-middleware">{props.fromMiddleware}</div>
  </>
)

export async function getServerSideProps({ res }) {
  return {
    props: {
      fromMiddleware: res.getHeader('x-from-middleware') || null,
    },
  }
}
