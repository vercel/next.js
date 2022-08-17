export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    props: {
      message: 'hello from slow layout',
      nowDuringExecution: Date.now(),
    },
  }
}

export default function gspLayout(props) {
  return (
    <>
      <h1 id="slow-layout-message">{props.message}</h1>
      <p id="slow-layout-now">{props.nowDuringExecution}</p>
      {props.children}
    </>
  )
}
