export function getStaticProps() {
  return { props: { message: 'hello world' } }
}

export default ({ message }) => <p id="content">{message}</p>
