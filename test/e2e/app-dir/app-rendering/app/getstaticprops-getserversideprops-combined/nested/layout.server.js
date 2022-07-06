export async function getServerSideProps() {
  return {
    props: {
      message: 'hello from layout',
      nowDuringExecution: Date.now(),
    },
  }
}

export default function gspLayout(props) {
  return (
    <>
      <h1 id="layout-message">{props.message}</h1>
      <p id="layout-now">{props.nowDuringExecution}</p>
      {props.children}
    </>
  )
}
