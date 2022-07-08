export async function getStaticProps() {
  return {
    props: {
      message: 'hello from page',
      now: Date.now(),
    },
    revalidate: 1,
  }
}
export default function nestedPage(props) {
  return (
    <>
      <p id="page-message">{props.message}</p>
      <p id="page-now">{props.now}</p>
    </>
  )
}
