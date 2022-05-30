export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    props: {
      message: 'hello from slow page',
    },
  }
}

export default function nestedPage(props) {
  return (
    <>
      <p id="slow-page-message">{props.message}</p>
    </>
  )
}
