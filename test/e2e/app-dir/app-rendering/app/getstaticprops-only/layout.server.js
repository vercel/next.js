export async function getStaticProps() {
  return {
    props: {
      message: 'hello from layout',
    },
  }
}

export default function gspLayout(props) {
  return (
    <>
      <h1 id="layout-message">{props.message}</h1>
      {props.children}
    </>
  )
}
