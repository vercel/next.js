export function getStaticProps() {
  return { props: { message: 'hello world' } }
}

const Basic = ({ message }) => <p id="content">{message}</p>

export default Basic
