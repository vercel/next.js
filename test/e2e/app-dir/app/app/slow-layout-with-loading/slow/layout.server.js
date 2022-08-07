export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    props: {
      message: 'hello from slow layout',
    },
  }
}

export default function SlowLayout(props) {
  return (
    <>
      <p id="slow-layout-message">{props.message}</p>
      {props.children}
    </>
  )
}
