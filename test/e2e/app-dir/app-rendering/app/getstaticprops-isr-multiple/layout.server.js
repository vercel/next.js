export async function getStaticProps() {
  return {
    props: {
      message: 'hello from layout',
      now: Date.now(),
    },
    revalidate: 1,
  }
}

export default function gspLayout(props) {
  return (
    <>
      <h1 id="layout-message">{props.message}</h1>
      <p id="layout-now">{props.now}</p>
      {props.children}
    </>
  )
}
