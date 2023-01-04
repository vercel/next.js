export default (props) => <div id="from-middleware">{props.fromMiddleware}</div>

export async function getServerSideProps({ res }) {
  return {
    props: {
      fromMiddleware: res.getHeader('x-from-middleware') || '',
    },
  }
}
