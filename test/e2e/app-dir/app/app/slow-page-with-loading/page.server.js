export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    props: {
      message: 'hello from slow page',
    },
  }
}

export default function SlowPage(props) {
  return <h1 id="slow-page-message">{props.message}</h1>
}
