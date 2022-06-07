export async function getServerSideProps() {
  return {
    props: {
      message: 'hello from layout',
    },
  }
}

export default function gsspLayout(props) {
  return (
    <>
      <h1 id="layout-message">{props.message}</h1>
      {props.children}
    </>
  )
}
