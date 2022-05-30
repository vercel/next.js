export async function getStaticProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    props: {
      message: 'hello from slow page',
      nowDuringBuild: Date.now(),
    },
  }
}

export default function nestedPage(props) {
  return (
    <>
      <p id="slow-page-message">{props.message}</p>
      <p id="slow-page-now">{props.nowDuringBuild}</p>
    </>
  )
}
