export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    props: {
      message: 'hello from slow layout',
    },
  }
}

export default function gsspLayout(props) {
  return (
    <>
      <h1 id="slow-layout-message">{props.message}</h1>
      {props.children}
    </>
  )
}
