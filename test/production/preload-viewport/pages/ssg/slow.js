export async function getStaticProps() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return { props: { message: 'hello world' } }
}

export default ({ message }) => <p id="content">slow {message}</p>
