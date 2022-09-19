export async function getStaticProps() {
  return {
    props: {
      message: 'hello from page',
      nowDuringBuild: Date.now(),
    },
  }
}

export default function nestedPage(props) {
  return (
    <>
      <p id="page-message">{props.message}</p>
      <p id="page-now">{props.nowDuringBuild}</p>
    </>
  )
}
